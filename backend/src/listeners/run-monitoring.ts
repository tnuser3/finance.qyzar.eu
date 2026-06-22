import type { Listener } from '../listeners';
import { runMonitoringWorkflow } from '../agents/workflows/monitoring';
import type { WatchPriority } from '../domain/watchlist/watchlist';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

function parsePriority(value: unknown): WatchPriority {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3) return n;
  return 1;
}

const config: Listener = {
  event: 'runMonitoring',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const model = asString(payload.model) || process.env.AGENT_MODEL || 'gpt-4';
    const priority = parsePriority(payload.priority);
    try {
    const result = await runMonitoringWorkflow({
        priority,
        model,
        trigger: 'manual',
        onEvent: (event) => {
          reply(ws, {
            event: 'runMonitoring',
            type: 'progress',
            ...event,
          });
        },
      });

      reply(ws, {
        event: 'runMonitoring',
        type: 'done',
        ok: result.ok,
        runId: result.runId,
        priority: result.priority,
        companiesScanned: result.companiesScanned,
        reportsSaved: result.reportsSaved,
        snapshotsSaved: result.snapshotsSaved,
      });
    } catch (error) {
      logError(error, { source: 'listeners/run-monitoring.ts - runMonitoring' });
      reply(ws, {
        event: 'runMonitoring',
        type: 'error',
        ok: false,
        error: error instanceof Error ? error.message : 'monitoring failed',
      });
    }
  },
};

export default config;
