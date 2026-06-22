import type { Listener } from '../listeners';
import { runMarketCorrelationWorkflow } from '../agents/workflows/correlation';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'runMarketCorrelation',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const model = asString(payload.model) || process.env.AGENT_MODEL || 'gpt-4';
    const from = asString(payload.from) || undefined;
    const to = asString(payload.to) || undefined;
    try {
    const result = await runMarketCorrelationWorkflow({
        from,
        to,
        model,
        trigger: 'manual',
        onEvent: (event) => {
          reply(ws, {
            event: 'runMarketCorrelation',
            type: 'progress',
            ...event,
          });
        },
      });

      reply(ws, {
        event: 'runMarketCorrelation',
        type: 'done',
        ok: result.ok,
        runId: result.runId,
        windowStart: result.windowStart,
        windowEnd: result.windowEnd,
        correlationsFound: result.correlationsFound,
        correlationsSaved: result.correlationsSaved,
        correlations: result.correlations,
      });
    } catch (error) {
      logError(error, { source: 'listeners/run-market-correlation.ts - runMarketCorrelation' });
      reply(ws, {
        event: 'runMarketCorrelation',
        type: 'error',
        ok: false,
        error: error instanceof Error ? error.message : 'correlation failed',
      });
    }
  },
};

export default config;
