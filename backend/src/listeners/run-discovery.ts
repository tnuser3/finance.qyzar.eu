import type { Listener } from '../listeners';
import { runDiscoveryWorkflow } from '../agents/workflows/discovery';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'runDiscovery',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const model = asString(payload.model) || process.env.AGENT_MODEL || 'gpt-4';
    const force = payload.force === true;
    try {
    const result = await runDiscoveryWorkflow({
        model,
        trigger: 'manual',
        force,
        onEvent: (event) => {
          reply(ws, {
            event: 'runDiscovery',
            type: 'progress',
            ...event,
          });
        },
      });

      reply(ws, {
        event: 'runDiscovery',
        type: 'done',
        ok: result.ok,
        runId: result.runId,
        newOpportunities: result.newOpportunities,
        companiesAdded: result.companiesAdded,
        companies: result.companies,
        reportsSaved: result.reportsSaved ?? 0,
        error: result.error,
      });
    } catch (error) {
      logError(error, { source: 'listeners/run-discovery.ts - runDiscovery' });
      reply(ws, {
        event: 'runDiscovery',
        type: 'error',
        ok: false,
        error: error instanceof Error ? error.message : 'discovery failed',
      });
    }
  },
};

export default config;
