import type { Listener } from '../listeners';
import { getRundown } from '../domain/ops/activity-log';
import * as pipelineRuns from '../domain/ops/pipeline-runs';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewAdvancedAi',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const limit = Number(payload.limit) || 100;
    const source = asString(payload.source) as
      | 'discovery'
      | 'monitoring'
      | 'event'
      | 'pipeline'
      | 'agent'
      | 'correlation'
      | '';
    try {
    const rundown = getRundown({
        limit,
        source: source || undefined,
      });
    const recentRuns = await pipelineRuns.listRuns(15);
    const grouped = rundown.reduce<Record<string, typeof rundown>>((acc, entry) => {
    const key = entry.source;
    if (!acc[key]) acc[key] = [];
        acc[key].push(entry);
        return acc;
      }, {});

      reply(ws, {
        event: 'viewAdvancedAi',
        ok: true,
        rundown,
        grouped,
        recentRuns,
        summary: {
          totalEntries: rundown.length,
          bySource: Object.fromEntries(
            Object.entries(grouped).map(([k, v]) => [k, v.length])
          ),
        },
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-advanced-ai.ts - viewAdvancedAi' });
      reply(ws, {
        event: 'viewAdvancedAi',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load AI rundown',
      });
    }
  },
};

export default config;
