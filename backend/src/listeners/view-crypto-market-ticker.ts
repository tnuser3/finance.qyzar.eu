import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { getCryptoMarketTicker } from '../providers/market/coingecko';
import { asRecord, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewCryptoMarketTicker',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const limit = Math.min(Math.max(Number(payload.limit) || 15, 1), 50);

    try {
      const { data: items, cache } = await withWsCache({
        event: 'viewCryptoMarketTicker',
        payload,
        keyParts: { limit },
        policyContext: { limit },
        fetch: () => getCryptoMarketTicker(limit, { bypassCache: true }),
      });

      reply(ws, {
        event: 'viewCryptoMarketTicker',
        ok: true,
        count: items.length,
        items,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-crypto-market-ticker.ts - viewCryptoMarketTicker' });
      reply(ws, {
        event: 'viewCryptoMarketTicker',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load crypto market ticker',
      });
    }
  },
};

export default config;
