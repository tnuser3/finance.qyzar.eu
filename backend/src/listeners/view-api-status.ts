import type { Listener } from '../listeners';
import { getAllApiStatus, getProviderStatus } from '../providers/api-status';
import { getOperationalApiStatus } from '../providers/health-check';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewApiStatus',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const providerId = asString(payload.provider).trim().toLowerCase();
    const includeAll = payload.includeAll === true;
    try {
    if (providerId) {
    const provider = getProviderStatus(providerId);
    if (!provider) {
          reply(ws, {
            event: 'viewApiStatus',
            ok: false,
            error: `unknown provider: ${providerId}`,
          });
          return;
        }

        if (!includeAll && (!provider.configured || provider.status !== 'ready')) {
          reply(ws, {
            event: 'viewApiStatus',
            ok: false,
            error: `provider unavailable: ${providerId} (${provider.status})`,
          });
          return;
        }

        reply(ws, {
          event: 'viewApiStatus',
          ok: true,
          provider,
        });
        return;
      }
    const status = includeAll ? getAllApiStatus() : getOperationalApiStatus();

      reply(ws, {
        event: 'viewApiStatus',
        ok: true,
        ...status,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-api-status.ts - viewApiStatus' });
      reply(ws, {
        event: 'viewApiStatus',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load API status',
      });
    }
  },
};

export default config;
