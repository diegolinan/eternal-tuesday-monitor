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
    ['model-discovery-event', events],
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
  const ids = new Set();
  const known = new Map();
  const apiIds = new Map();
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
  const policy = await json('config/probe-execution-policy.json');
  if (
    policy.execution_enabled !== false ||
    policy.max_runs_per_day !== 0 ||
    policy.max_total_tokens_per_day !== 0
  )
    errors.push(
      'Paid execution is outside this phase and must remain disabled',
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
