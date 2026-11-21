import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './temporal/activities';
import { TASK_QUEUE, TEMPORAL_ADDRESS } from './config';

async function run() {
  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./temporal/workflows'),
    activities,
  });
  console.log(`Worker started on queue "${TASK_QUEUE}"`);
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});