import type { Listener } from '../listeners';
import { buildOverview } from '../domain/ops/overview';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewOverview',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    try {
    const overview = await buildOverview();

      reply(ws, {
        event: 'viewOverview',
        ok: true,
        overview,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-overview.ts - viewOverview' });
      reply(ws, {
        event: 'viewOverview',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load overview',
      });
    }
  },
};

export default config;
