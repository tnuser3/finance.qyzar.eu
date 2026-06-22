import type { Listener } from '../listeners';
import * as pipelineRuns from '../domain/ops/pipeline-runs';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'getPipelineRuns',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const limit = Number(payload.limit) || 20;
    try {
    const runs = await pipelineRuns.listRuns(limit);

      reply(ws, {
        event: 'getPipelineRuns',
        ok: true,
        count: runs.length,
        runs,
      });
    } catch (error) {
      logError(error, { source: 'listeners/get-pipeline-runs.ts - getPipelineRuns' });
      reply(ws, {
        event: 'getPipelineRuns',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load pipeline runs',
      });
    }
  },
};

export default config;
