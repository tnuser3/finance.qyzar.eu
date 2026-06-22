import { API_PROVIDERS, getAllApiStatus, getProviderStatus, type ApiStatusPayload } from './api-status';
import { isCommandNameAvailable } from './command-availability';
import '../agents/commands/index';
import * as registry from '../agents/runtime/registry';
import * as rooms from '../ws/rooms';
import { publishSnapshot as publishDiscoverySnapshot } from '../domain/ops/discovery-status';
import { logError } from '../infra/db/error-log';

const HEALTH_CHECK_ENABLED = process.env.API_HEALTH_CHECK_ENABLED !== 'false';


const PROVIDER_PROBES: Record<string, { name: string; parameters: Record<string, unknown> }> = {
  alphavantage: { name: 'alphavantage_global_quote', parameters: { symbol: 'IBM' } },
  fmp: { name: 'fmp_quote', parameters: { symbol: 'IBM' } },
  finnhub: { name: 'finnhub_quote', parameters: { symbol: 'IBM' } },
  massive: { name: 'massive_ticker_search', parameters: { search: 'IBM', limit: 1 } },
  coingecko: { name: 'coingecko_price', parameters: { symbol: 'BTC' } },
  gdelt: {
    name: 'gdelt_search_articles',
    parameters: { query: 'economy sourcelang:english', maxrecords: 1, timespan: '24h' },
  },
  guardian: { name: 'guardian_search', parameters: { q: 'economy', 'page-size': 1 } },
  currentsapi: { name: 'currentsapi_latest_news', parameters: { language: 'en' } },
  gnews: { name: 'gnews_top_headlines', parameters: { lang: 'en', max: 1 } },
  rss: { name: 'rss_fetch_tier', parameters: { tier: 1, limitPerFeed: 1 } },
  fred: { name: 'fred_search_series', parameters: { search_text: 'GDP', limit: 1 } },
  census: {
    name: 'census_acs5',
    parameters: { year: '2022', variables: 'NAME', geography: 'state:*' },
  },
  edgar: { name: 'edgar_search_filings', parameters: { query: '10-K', size: 1 } },
  reddit: { name: 'reddit_search', parameters: { q: 'stocks', sort: 'top', time: 'day', limit: 1 } },
  stocktwits: { name: 'stocktwits_symbol_stream', parameters: { symbol: 'SPY' } },
  googletrends: { name: 'googletrends_related_queries', parameters: { keyword: 'stocks', geo: 'US' } },
};

export function getOperationalApiStatus(): ApiStatusPayload {
  const all = getAllApiStatus();
  const providers = all.providers.filter(
    (provider) => provider.configured && provider.status === 'ready'
  );

  return {
    summary: {
      checkedAt: all.summary.checkedAt,
      total: providers.length,
      ready: providers.length,
      degraded: 0,
      unconfigured: 0,
      error: 0,
      unknown: 0,
    },
    providers,
  };
}

async function probeProvider(providerId: string): Promise<{
  providerId: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}> {
  const probe = PROVIDER_PROBES[providerId];
  const started = Date.now();

  if (!probe || !registry.get(probe.name)) {
    return { providerId, ok: false, durationMs: 0, error: 'no probe configured' };
  }

  if (!isCommandNameAvailable(probe.name)) {
    return { providerId, ok: false, durationMs: 0, error: 'probe command unavailable' };
  }

  try {
    const result = await registry.execute({ name: probe.name, parameters: probe.parameters });
    const durationMs = result.durationMs ?? Date.now() - started;
    return {
      providerId,
      ok: result.ok,
      durationMs,
      error: result.ok ? undefined : result.error,
    };
  } catch (error) {
      logError(error, { source: 'util/api-health-check.ts - probeProvider' });
    return {
      providerId,
      ok: false,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runApiHealthCheck(options?: {
  broadcast?: boolean;
  probeUnknown?: boolean;
}): Promise<ApiStatusPayload & { probes: Array<{ providerId: string; ok: boolean; durationMs: number; error?: string }> }> {
  const broadcast = options?.broadcast !== false;
  const probeUnknown = options?.probeUnknown !== false;
  const probes: Array<{ providerId: string; ok: boolean; durationMs: number; error?: string }> = [];

  const candidates = API_PROVIDERS.filter((definition) => {
    if (!definition.isConfigured()) return false;
    if (definition.id === 'deepai' || definition.id === 'yahoo' || definition.id === 'usaspending' || definition.id === 'lda') {
      return false;
    }

    const status = getProviderStatus(definition.id);
    if (!status) return false;
    if (status.rateLimit.rateLimited) return false;

    if (probeUnknown) {
      return status.status === 'unknown' || status.status === 'error' || status.status === 'ready';
    }

    return status.status === 'unknown' || status.status === 'error';
  });

  for (const definition of candidates) {
    const result = await probeProvider(definition.id);
    if (result.durationMs > 0 || result.error !== 'no probe configured') {
      probes.push(result);
    }
  }

  const status = getOperationalApiStatus();
  const payload = { ...status, probes };

  if (broadcast && HEALTH_CHECK_ENABLED) {
    rooms.broadcast('api-status', {
      event: 'viewApiStatus',
      type: 'update',
      ok: true,
      reason: 'health_check',
      ...payload,
    });
    publishDiscoverySnapshot('api_health_check');
  }

  return payload;
}

export function isHealthCheckEnabled(): boolean {
  return HEALTH_CHECK_ENABLED;
}
