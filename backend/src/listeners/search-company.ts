import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { searchCompany } from '../domain/watchlist/company-search';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'searchCompany',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const query = asString(payload.query).trim();
    const ticker = asString(payload.ticker).trim().toUpperCase();
    const addToWatchlist = payload.addToWatchlist !== false;

    if (!query && !ticker) {
      reply(ws, {
        event: 'searchCompany',
        ok: false,
        error: 'query or ticker is required',
      });
      return;
    }

    try {
      const lookup = query || ticker;
      const { data: result, cache } = await withWsCache({
        event: 'searchCompany',
        payload,
        keyParts: {
          query: lookup,
          add: addToWatchlist ? 1 : 0,
        },
        policyContext: { query: lookup, ticker },
        fetch: () =>
          searchCompany(lookup, {
            addToWatchlist,
            ticker: ticker || undefined,
          }),
      });

      reply(ws, {
        event: 'searchCompany',
        ok: true,
        ...result,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/search-company.ts - searchCompany' });
      reply(ws, {
        event: 'searchCompany',
        ok: false,
        error: error instanceof Error ? error.message : 'search failed',
      });
    }
  },
};

export default config;
