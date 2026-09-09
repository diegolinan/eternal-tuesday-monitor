import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const readJson = async (root, relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));

const safeRelative = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes('..')
  )
    throw new Error('UNSAFE_REPRODUCTION_PATH');
  return value;
};

export async function loadReproductionState(root) {
  const [caseFile, targetFile, policy] = await Promise.all([
    readJson(root, 'reproduction/cases.json'),
    readJson(root, 'data/evidence-discovery/reproduction-targets.json'),
    readJson(root, 'config/surface-reproduction-policy.json'),
  ]);
  return {
    cases: caseFile.cases,
    targets: targetFile.targets,
    protocols: policy.protocols,
  };
}

export async function reproductionPlan(root, targetId) {
  const state = await loadReproductionState(root);
  const target = state.targets.find((item) => item.id === targetId);
  const reproductionCase = state.cases.find(
    (item) => item.target_id === targetId,
  );
  if (!target || !reproductionCase)
    throw new Error('UNKNOWN_REPRODUCTION_TARGET');
  const protocol = state.protocols.find(
    (item) => item.id === target.protocol_id,
  );
  if (!protocol) throw new Error('UNKNOWN_REPRODUCTION_PROTOCOL');
  return {
    mode: 'PLAN_ONLY_NO_MODEL_EXECUTION',
    target,
    case: reproductionCase,
    protocol: {
      id: protocol.id,
      executionClass: protocol.execution_class,
      minimumIndependentTrials: protocol.minimum_independent_trials,
    },
    automaticExecution: false,
    automaticEvidenceAcceptance: false,
  };
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function filesBelow(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await filesBelow(absolute, relative)));
    else if (entry.isFile()) files.push(relative.replaceAll('\\', '/'));
  }
  return files;
}

export async function prepareReproductionKit(root, targetId, destination) {
  const plan = await reproductionPlan(root, targetId);
  if ((await stat(destination).catch(() => null)) !== null)
    throw new Error('REPRODUCTION_DESTINATION_EXISTS');
  await mkdir(destination, { recursive: true });
  const fixtureSource = path.join(
    root,
    safeRelative(plan.case.fixture_directory),
  );
  const fixtureDestination = path.join(destination, 'fixture');
  await cp(fixtureSource, fixtureDestination, { recursive: true });
  const outputSchemaSource = path.join(
    root,
    safeRelative(plan.case.output_schema_path),
  );
  const outputSchemaDestination = path.join(destination, 'record.schema.json');
  await cp(outputSchemaSource, outputSchemaDestination);
  const files = await filesBelow(fixtureDestination);
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        await sha256File(path.join(fixtureDestination, file)),
      ]),
    ),
  );
  const manifest = {
    schemaVersion: '1.0.0',
    targetId,
    caseId: plan.case.id,
    caseVersion: plan.case.case_version,
    requestedModel: plan.case.requested_model,
    executionMode: plan.case.execution_mode,
    minimumTrials: plan.case.minimum_trials,
    fixtureSha256: hashes,
    recordSchemaSha256: await sha256File(outputSchemaDestination),
    status: 'PREPARED_NOT_EXECUTED',
  };
  await writeFile(
    path.join(destination, 'kit-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx' },
  );
  await writeFile(
    path.join(destination, 'RUNBOOK.md'),
    `# Reproduction kit: ${targetId}\n\n` +
      `Status: **prepared, not executed**.\n\n` +
      `Use exactly **${plan.case.requested_model}** for ${plan.case.minimum_trials} independent trials. ` +
      `Record product version, authentication mode, operating system, time zone, continuous capture and transcript for every trial. ` +
      `Evaluate only against the PASS and FAIL conditions in the case plan and record the result using \`record.schema.json\`. ` +
      `Do not substitute another model or surface. A completed kit remains pending human evidence review.\n`,
    { flag: 'wx' },
  );
  return { plan, manifest, destination };
}

export async function verifyReproductionKit(destination) {
  const manifest = JSON.parse(
    await readFile(path.join(destination, 'kit-manifest.json'), 'utf8'),
  );
  if (manifest.status !== 'PREPARED_NOT_EXECUTED')
    throw new Error('INVALID_REPRODUCTION_KIT_STATUS');
  const fixtureDirectory = path.join(destination, 'fixture');
  const files = await filesBelow(fixtureDirectory);
  const expected = Object.keys(manifest.fixtureSha256).sort();
  if (JSON.stringify(files.sort()) !== JSON.stringify(expected))
    throw new Error('REPRODUCTION_FIXTURE_FILE_SET_CHANGED');
  for (const file of files)
    if (
      (await sha256File(path.join(fixtureDirectory, file))) !==
      manifest.fixtureSha256[file]
    )
      throw new Error('REPRODUCTION_FIXTURE_HASH_CHANGED');
  if (
    (await sha256File(path.join(destination, 'record.schema.json'))) !==
    manifest.recordSchemaSha256
  )
    throw new Error('REPRODUCTION_RECORD_SCHEMA_CHANGED');
  return manifest;
}

export function safeReproductionError(error) {
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message ?? '')
    ? error.message
    : 'REPRODUCTION_OPERATION_FAILED';
}
