import type { Listener } from '../listeners';
import * as watchlist from '../domain/watchlist/watchlist';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'getWatchlist',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    try {
    const count = await watchlist.countActive();

      reply(ws, {
        event: 'getWatchlist',
        ok: true,
        hidden: true,
        count,
        message: 'Watchlist contents are managed internally. Search for a company to track it.',
      });
    } catch (error) {
      logError(error, { source: 'listeners/get-watchlist.ts - getWatchlist' });
      reply(ws, {
        event: 'getWatchlist',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load watchlist',
      });
    }
  },
};

export default config;
