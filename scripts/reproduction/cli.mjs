import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadReproductionState,
  prepareReproductionKit,
  reproductionPlan,
  safeReproductionError,
  verifyReproductionKit,
} from './core.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);

try {
  if (!args.length || (args.length === 1 && args[0] === '--list')) {
    const state = await loadReproductionState(root);
    console.log(
      JSON.stringify(
        {
          mode: 'PLAN_ONLY_NO_MODEL_EXECUTION',
          targets: state.cases.map((item) => ({
            targetId: item.target_id,
            model: item.requested_model,
            executionMode: item.execution_mode,
            runnerState: item.runner_state,
          })),
        },
        null,
        2,
      ),
    );
  } else if (args.length === 2 && args[0] === '--plan') {
    console.log(JSON.stringify(await reproductionPlan(root, args[1]), null, 2));
  } else if (args.length === 2 && args[0] === '--prepare') {
    const destination = path.join(root, '.reproduction', 'kits', args[1]);
    const result = await prepareReproductionKit(root, args[1], destination);
    console.log(
      JSON.stringify(
        {
          targetId: result.manifest.targetId,
          status: result.manifest.status,
          destination,
        },
        null,
        2,
      ),
    );
  } else if (args.length === 2 && args[0] === '--verify') {
    const destination = path.join(root, '.reproduction', 'kits', args[1]);
    console.log(
      JSON.stringify(
        {
          verified: true,
          manifest: await verifyReproductionKit(destination),
        },
        null,
        2,
      ),
    );
  } else if (args.includes('--live')) {
    throw new Error('LIVE_EXECUTION_REQUIRES_PROTECTED_WORKFLOW');
  } else throw new Error('INVALID_ARGUMENTS');
} catch (error) {
  console.error(safeReproductionError(error));
  process.exitCode = 1;
}
