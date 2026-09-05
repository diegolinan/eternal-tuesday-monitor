import { fileURLToPath } from 'node:url';
import { runManualEvaluation } from './manual-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const result = await runManualEvaluation({
  root,
  modelId: process.env.EVALUATION_MODEL_ID,
  apiModelId: process.env.EVALUATION_API_MODEL_ID,
  acceptedSpendUsd: Number(process.env.EVALUATION_MAX_COST_USD),
});
console.log(JSON.stringify(result, null, 2));
