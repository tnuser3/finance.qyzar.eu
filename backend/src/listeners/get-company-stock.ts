import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { getCompanyStockQuote, getCompanyStockQuotes } from '../providers/market/yahoo-finance';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'getCompanyStock',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const ticker = asString(payload.ticker).trim().toUpperCase();
    const tickersRaw = asString(payload.tickers).trim();

    if (!ticker && !tickersRaw) {
      reply(ws, {
        event: 'getCompanyStock',
        ok: false,
        error: 'ticker or tickers is required',
      });
      return;
    }

    try {
      if (tickersRaw) {
        const tickers = tickersRaw
          .split(',')
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean);

        const { data: result, cache } = await withWsCache({
          event: 'getCompanyStock',
          payload,
          keyParts: { tickers: tickers.join(',') },
          policyContext: { ticker: tickers.join(',') },
          fetch: () => getCompanyStockQuotes(tickers, { bypassCache: true }),
        });

        reply(ws, {
          event: 'getCompanyStock',
          ok: true,
          quotes: result.data,
          cache,
        });
        return;
      }

      const { data: result, cache } = await withWsCache({
        event: 'getCompanyStock',
        payload,
        keyParts: { ticker },
        policyContext: { ticker },
        fetch: () => getCompanyStockQuote(ticker, { bypassCache: true }),
      });

      reply(ws, {
        event: 'getCompanyStock',
        ok: true,
        quote: result.data,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/get-company-stock.ts - getCompanyStock' });
      reply(ws, {
        event: 'getCompanyStock',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load stock quote',
      });
    }
  },
};

export default config;
