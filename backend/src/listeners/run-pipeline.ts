import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import { runPipeline } from '../agents/runtime/pipeline';
import { getByRunId } from '../agents/reports';
import { logActivity, formatRundownMessage } from '../domain/ops/activity-log';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'runPipeline',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const model = asString(payload.model) || 'gpt-4';
    const focus = asString(payload.focus);
    try {
    const result = await runPipeline({
        accountId: getSystemAccountId(),
        model,
        focus: focus || undefined,
        onEvent: (event) => {
          logActivity({
            source: 'pipeline',
            type: String(event.type ?? 'progress'),
            message: formatRundownMessage(event),
            runId: event.runId ? String(event.runId) : undefined,
            data: event,
          });

          reply(ws, {
            event: 'runPipeline',
            type: 'progress',
            ...event,
          });
        },
      });
    const saved = await getByRunId(result.runId);

      reply(ws, {
        event: 'runPipeline',
        type: 'done',
        ok: result.ok,
        runId: result.runId,
        savedCount: result.savedCount,
        report: result.report,
        discovery: result.discovery,
        risk: result.risk,
        decision: result.decision,
        saved,
      });
    } catch (error) {
      logError(error, { source: 'listeners/run-pipeline.ts - runPipeline' });
    const message = error instanceof Error ? error.message : 'pipeline failed';

      reply(ws, {
        event: 'runPipeline',
        type: 'error',
        ok: false,
        error: message,
      });
    }
  },
};

export default config;
