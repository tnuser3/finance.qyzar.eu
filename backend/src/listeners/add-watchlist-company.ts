import type { Listener } from '../listeners';
import { searchCompany } from '../domain/watchlist/company-search';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'addWatchlistCompany',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const tickerInput = asString(payload.ticker).trim().toUpperCase();
    const query = asString(payload.query).trim();
    if (!tickerInput && !query) {
      reply(ws, {
        event: 'addWatchlistCompany',
        ok: false,
        error: 'ticker or query is required',
      });
      return;
    }
    try {
    const result = await searchCompany(query || tickerInput, {
        addToWatchlist: true,
        ticker: tickerInput || undefined,
      });
    if (!result.company) {
        reply(ws, {
          event: 'addWatchlistCompany',
          ok: false,
          error: result.message ?? 'company not found',
        });
        return;
      }

      reply(ws, {
        event: 'addWatchlistCompany',
        ok: true,
        company: result.company,
        addedToWatchlist: result.addedToWatchlist,
        message: result.message,
      });
    } catch (error) {
      logError(error, { source: 'listeners/add-watchlist-company.ts - addWatchlistCompany' });
      reply(ws, {
        event: 'addWatchlistCompany',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to add company',
      });
    }
  },
};

export default config;
