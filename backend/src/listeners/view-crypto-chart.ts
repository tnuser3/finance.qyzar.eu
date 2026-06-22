import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { getCryptoChartBars } from '../providers/market/coingecko';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewCryptoChart',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const symbol = asString(payload.symbol).trim().toUpperCase();
    const days = Math.min(Math.max(Number(payload.days) || 7, 1), 90);
    const interval = asString(payload.interval).trim() || undefined;

    if (!symbol) {
      reply(ws, {
        event: 'viewCryptoChart',
        ok: false,
        error: 'symbol is required',
      });
      return;
    }

    try {
      const { data: result, cache } = await withWsCache({
        event: 'viewCryptoChart',
        payload,
        keyParts: {
          symbol,
          days,
          interval: interval ?? 'auto',
        },
        policyContext: { days, interval, symbol },
        fetch: async () => {
          const bars = await getCryptoChartBars(symbol, days, {
            interval,
            bypassCache: true,
          });
          const sliced = bars.length > days * 24 ? bars.slice(-days * 24) : bars;

          return {
            ok: true as const,
            symbol,
            days,
            count: sliced.length,
            bars: sliced,
          };
        },
      });

      reply(ws, {
        event: 'viewCryptoChart',
        ...result,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-crypto-chart.ts - viewCryptoChart' });
      reply(ws, {
        event: 'viewCryptoChart',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load crypto chart',
      });
    }
  },
};

export default config;
