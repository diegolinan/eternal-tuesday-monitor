import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { allowedUrl } from './fetch.mjs';
export async function validateDiscovery(root) {
  const json = async (file) =>
    JSON.parse(await readFile(path.join(root, file), 'utf8'));
  const config = await json('config/model-discovery.json');
  const relevancePolicy = await json('config/model-relevance-policy.json');
  const events = (
    await readFile(path.join(root, 'data/model-discovery/events.jsonl'), 'utf8')
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  const catalog = (await json('data/catalog/models.json')).models;
  const vendors = (await json('data/catalog/vendors.json')).vendors;
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const errors = [];
  for (const [schema, items] of [
    ['model-discovery-config', [config]],
    ['model-relevance-policy', [relevancePolicy]],
    ['model-discovery-event', events],
    ['model-catalog', [{ schema_version: '2.0.0', models: catalog }]],
  ]) {
    const validate = ajv.compile(await json(`schemas/${schema}.schema.json`));
    for (const item of items)
      if (!validate(item))
        errors.push(`${schema}: ${ajv.errorsText(validate.errors)}`);
  }
  const sourceIds = new Set();
  for (const source of config.sources) {
    if (sourceIds.has(source.id)) errors.push(`duplicate source ${source.id}`);
    sourceIds.add(source.id);
    if (!vendors.some((v) => v.id === source.vendor_id))
      errors.push(`unknown vendor ${source.vendor_id}`);
    try {
      allowedUrl(source.url, source);
      new RegExp(source.id_pattern);
    } catch {
      errors.push(`invalid source ${source.id}`);
    }
  }
  const relevanceRuleIds = new Set();
  for (const rule of relevancePolicy.rules) {
    if (relevanceRuleIds.has(rule.id))
      errors.push(`duplicate relevance rule ${rule.id}`);
    relevanceRuleIds.add(rule.id);
    if (
      rule.vendor_id &&
      !vendors.some((vendor) => vendor.id === rule.vendor_id)
    )
      errors.push(`unknown relevance vendor ${rule.vendor_id}`);
    try {
      new RegExp(rule.api_id_pattern, 'i');
    } catch {
      errors.push(`invalid relevance pattern ${rule.id}`);
    }
  }
  const ids = new Set();
  const known = new Map();
  const apiIds = new Map();
  const canonicalNames = new Map();
  for (const model of catalog) {
    const nameKey = `${model.vendor_id}|${model.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    if (
      model.identity_status === 'named' &&
      canonicalNames.has(nameKey) &&
      canonicalNames.get(nameKey) !== model.id
    )
      errors.push(`duplicate canonical identity ${nameKey}`);
    canonicalNames.set(nameKey, model.id);
    for (const identity of [
      model.api_model_id,
      ...(model.aliases ?? []),
    ].filter(Boolean)) {
      const key = `${model.vendor_id}|${identity}`;
      if (apiIds.has(key) && apiIds.get(key) !== model.id)
        errors.push(`duplicate catalog API identity or alias ${key}`);
      apiIds.set(key, model.id);
    }
    if (model.api_model_id && model.aliases?.includes(model.api_model_id))
      errors.push(`canonical API ID repeated as alias ${model.id}`);
    if (
      model.catalog_status === 'ACCEPTED_DISCOVERY' &&
      model.relevance_state === 'UNCLASSIFIED'
    )
      errors.push(`accepted discovery lacks relevance decision ${model.id}`);
    if (
      ['POLICY_CLASSIFIED', 'REVIEW_REQUIRED'].includes(
        model.relevance_review?.status,
      ) &&
      (model.relevance_review.policy_id !== relevancePolicy.policy_id ||
        ![
          ...relevanceRuleIds,
          'exact-api-id-required',
          'fallback-review',
        ].includes(model.relevance_review.rule_id))
    )
      errors.push(`invalid relevance policy decision ${model.id}`);
    if (model.supersedes_model_id) {
      const prior = catalog.find(
        (entry) => entry.id === model.supersedes_model_id,
      );
      if (
        !prior ||
        prior.id === model.id ||
        prior.vendor_id !== model.vendor_id
      )
        errors.push(`invalid reviewed catalog supersession ${model.id}`);
      if (model.supersession_review?.status !== 'REVIEWED_ACCEPTED')
        errors.push(`unreviewed catalog supersession ${model.id}`);
    }
  }
  apiIds.clear();
  for (const event of events) {
    if (ids.has(event.id)) errors.push(`duplicate discovery event ${event.id}`);
    ids.add(event.id);
    const model = event.model;
    if (
      !catalog.some((m) => m.id === model.id && m.vendor_id === model.vendor_id)
    )
      errors.push(`model absent from catalog ${model.id}`);
    if (event.recorded_on < model.discovered_on)
      errors.push(`discovery chronology ${model.id}`);
    if (
      model.account_checked_on &&
      model.account_checked_on > event.recorded_on
    )
      errors.push(`future account check ${model.id}`);
    const prior = known.get(model.id);
    if (
      prior &&
      (prior.vendor_id !== model.vendor_id ||
        prior.discovered_on !== model.discovered_on)
    )
      errors.push(`historical model identity changed ${model.id}`);
    if (model.api_model_id) {
      const key = `${model.vendor_id}|${model.api_model_id}`;
      if (apiIds.has(key) && apiIds.get(key) !== model.id)
        errors.push(`duplicate exact API identity ${key}`);
      apiIds.set(key, model.id);
    }
    if (
      model.supersedes_model_id &&
      !catalog.some(
        (m) =>
          m.id === model.supersedes_model_id &&
          m.vendor_id === model.vendor_id &&
          m.id !== model.id,
      )
    )
      errors.push(`invalid supersession ${model.id}`);
    for (const provenance of model.provenance) {
      const source = config.sources.find(
        (s) => s.id === provenance.source_id && s.vendor_id === model.vendor_id,
      );
      try {
        if (!source) throw new Error();
        allowedUrl(provenance.url, source);
      } catch {
        errors.push(`untrusted provenance ${model.id}`);
      }
    }
    known.set(model.id, model);
  }
  for (const model of latestModelsForValidation(events)) {
    const entry = catalog.find((item) => item.id === model.id);
    if (!entry) continue;
    for (const [catalogField, eventField] of [
      ['api_model_id', 'api_model_id'],
      ['release_state', 'release_state'],
    ])
      if (entry[catalogField] !== model[eventField])
        errors.push(`catalog snapshot mismatch ${model.id}.${catalogField}`);
    if (JSON.stringify(entry.aliases) !== JSON.stringify(model.aliases))
      errors.push(`catalog snapshot mismatch ${model.id}.aliases`);
    if (
      JSON.stringify(entry.discovery_provenance) !==
      JSON.stringify(model.provenance)
    )
      errors.push(`catalog snapshot mismatch ${model.id}.discovery_provenance`);
  }
  const policy = await json('config/probe-execution-policy.json');
  if (
    policy.execution_enabled !== false ||
    policy.max_runs_per_day !== 0 ||
    policy.max_total_tokens_per_day !== 0
  )
    errors.push(
      'Automated paid execution must remain disabled; manual pilot approval is separate',
    );
  for (const method of policy.methodologies) {
    if (
      !method.id ||
      method.status !== 'approved' ||
      !policy.providers.includes(method.provider_id) ||
      !method.endpoint ||
      !method.api_surface_id ||
      !method.acceptance_policy_id ||
      !/^scripts\/probes\/[a-zA-Z0-9._/-]+\.mjs$/.test(
        method.implementation_path ?? '',
      ) ||
      (method.implementation_path ?? '').includes('..') ||
      !Array.isArray(method.required_capabilities) ||
      !Array.isArray(method.required_parameters)
    )
      errors.push('Invalid methodology compatibility contract');
    else {
      try {
        const code = await readFile(
          path.join(root, method.implementation_path),
        );
        if (
          createHash('sha256').update(code).digest('hex') !==
          method.implementation_sha256
        )
          errors.push('Approved methodology implementation hash mismatch');
      } catch {
        errors.push('Approved methodology implementation missing');
      }
    }
  }
  return errors;
}

function latestModelsForValidation(events) {
  const models = new Map();
  for (const event of events) models.set(event.model.id, event.model);
  return [...models.values()];
}
