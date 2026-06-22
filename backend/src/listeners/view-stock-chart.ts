import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { fetchPriceBars } from '../domain/timeline/correlation';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewStockChart',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const ticker = asString(payload.ticker).trim().toUpperCase();
    const days = Math.min(Math.max(Number(payload.days) || 7, 1), 90);
    const interval = asString(payload.interval).trim() || undefined;

    if (!ticker) {
      reply(ws, {
        event: 'viewStockChart',
        ok: false,
        error: 'ticker is required',
      });
      return;
    }

    try {
      const { data: result, cache } = await withWsCache({
        event: 'viewStockChart',
        payload,
        keyParts: {
          ticker,
          days,
          interval: interval ?? 'daily',
        },
        policyContext: { days, interval, ticker },
        fetch: async () => {
          const to = new Date();
          const from = new Date(to);
          from.setUTCDate(to.getUTCDate() - days);
          const bars = await fetchPriceBars(ticker, from, to, { bypassCache: true });
          const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
          const sliced = sorted.length > days ? sorted.slice(-days) : sorted;

          return {
            ok: true as const,
            ticker,
            days,
            count: sliced.length,
            bars: sliced,
          };
        },
      });

      reply(ws, {
        event: 'viewStockChart',
        ...result,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-stock-chart.ts - viewStockChart' });
      reply(ws, {
        event: 'viewStockChart',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load stock chart',
      });
    }
  },
};

export default config;
