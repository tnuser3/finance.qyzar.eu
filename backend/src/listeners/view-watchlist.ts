import type { Listener } from '../listeners';
import * as watchlist from '../domain/watchlist/watchlist';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewWatchlist',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    try {
    const count = await watchlist.countActive();

      reply(ws, {
        event: 'viewWatchlist',
        ok: true,
        hidden: true,
        count,
        message: 'Watchlist contents are managed internally. Use searchCompany to look up and track a ticker.',
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-watchlist.ts - viewWatchlist' });
      reply(ws, {
        event: 'viewWatchlist',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load watchlist',
      });
    }
  },
};

export default config;
