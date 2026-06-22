import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { getMarketTicker } from '../providers/market/yahoo-finance';
import { asRecord, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewMarketTicker',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 50);

    try {
      const { data: result, cache } = await withWsCache({
        event: 'viewMarketTicker',
        payload,
        keyParts: { limit },
        policyContext: { limit },
        fetch: () => getMarketTicker(limit),
      });

      reply(ws, {
        event: 'viewMarketTicker',
        ok: true,
        count: result.data.length,
        items: result.data.map((item) => ({
          ticker: item.ticker,
          name: item.name,
          price: item.price,
          change: item.change,
          changePercent: item.changePercent,
          currency: item.currency,
          marketState: item.marketState,
          logo: item.logo,
        })),
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-market-ticker.ts - viewMarketTicker' });
      reply(ws, {
        event: 'viewMarketTicker',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load market ticker',
      });
    }
  },
};

export default config;
