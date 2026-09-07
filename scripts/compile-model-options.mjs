import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));

const [vendorCatalog, modelCatalog] = await Promise.all([
  readJson('data/catalog/vendors.json'),
  readJson('data/catalog/models.json'),
]);

const catalogCheckedThrough =
  modelCatalog.models
    .flatMap((model) => model.discovery_provenance ?? [])
    .map((source) => source.checked_on)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

const excludedModelIds = new Set([
  'model-not-specified',
  'model-unknown',
  'model-tictoc-18-models',
]);

const output = {
  schemaVersion: '1.0.0',
  catalogSchemaVersion: modelCatalog.schema_version,
  catalogCheckedThrough,
  vendors: vendorCatalog.vendors
    .map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      models: modelCatalog.models
        .filter(
          (model) =>
            model.vendor_id === vendor.id && !excludedModelIds.has(model.id),
        )
        .map((model) => ({
          id: model.id,
          name: model.name,
          apiModelId: model.api_model_id ?? null,
        }))
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id),
        ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name)),
};

const destination = path.join(root, 'public/data/model-options.json');
await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Compiled ${output.vendors.length} vendors and ${output.vendors.reduce((sum, vendor) => sum + vendor.models.length, 0)} model choices.`,
);
