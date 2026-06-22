import * as watchlist from '../domain/watchlist/watchlist';
import { asRecord, asString } from './reply';

const BLOCKED_EVENTS = new Set([
  'signup',
  'login',
  'logout',
  'verifyToken',
  'requestRevalidation',
  'revalidate',
  'setConfig',
  'registerFcmToken',
  'sendNotification',
  'markNotificationRead',
  'addWatchlistCompany',
  'runDiscovery',
  'runMonitoring',
  'runMarketCorrelation',
  'runPipeline',
  'agent',
]);

export interface AccessResult {
  ok: boolean;
  error?: string;
  payload?: Record<string, unknown>;
}

function normalizeTicker(value: unknown): string {
  return asString(value).trim().toUpperCase();
}

export async function enforceAccess(
  event: string,
  data: unknown
): Promise<AccessResult> {
  const payload = asRecord(data);

  if (BLOCKED_EVENTS.has(event)) {
    return {
      ok: false,
      error:
        'This action is disabled. The app is read-only except when searching a new company to track.',
    };
  }

  if (event === 'searchCompany') {
    const ticker = normalizeTicker(payload.ticker);
    const query = asString(payload.query).trim();
    const lookup = ticker || query.toUpperCase();

    if (lookup) {
      const existing = await watchlist.getByTicker(lookup);

      if (existing) {
        return {
          ok: true,
          payload: {
            ...payload,
            addToWatchlist: false,
          },
        };
      }
    }

    return {
      ok: true,
      payload: {
        ...payload,
        addToWatchlist: payload.addToWatchlist !== false,
      },
    };
  }

  return { ok: true, payload };
}
