import type { Listener } from '../listeners';
import * as watchlist from '../domain/watchlist/watchlist';
import * as snapshots from '../domain/watchlist/snapshots';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'getCompanyHistory',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const ticker = asString(payload.ticker).trim().toUpperCase();
    const limit = Number(payload.limit) || 30;
    if (!ticker) {
      reply(ws, {
        event: 'getCompanyHistory',
        ok: false,
        error: 'ticker is required',
      });
      return;
    }
    try {
    const company = await watchlist.getByTicker(ticker);
    if (!company) {
        reply(ws, {
          event: 'getCompanyHistory',
          ok: false,
          error: `company not found: ${ticker}`,
        });
        return;
      }
    const history = await snapshots.getHistory(company.id, limit);
    const delta = await snapshots.getSnapshotDelta(company.id);

      reply(ws, {
        event: 'getCompanyHistory',
        ok: true,
        company,
        history,
        delta,
      });
    } catch (error) {
      logError(error, { source: 'listeners/get-company-history.ts - getCompanyHistory' });
      reply(ws, {
        event: 'getCompanyHistory',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load history',
      });
    }
  },
};

export default config;
