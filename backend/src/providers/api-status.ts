import { getRateLimitStatus } from '../infra/http/ratelimit';

export type ApiProviderStatus =
  | 'ready'
  | 'degraded'
  | 'unconfigured'
  | 'error'
  | 'unknown';

export type ApiOutcome = 'success' | 'error' | 'rate_limited';

export interface ApiProviderDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  requiresApiKey: boolean;
  isConfigured: () => boolean;
}

export interface ApiProviderStatusSnapshot {
  id: string;
  name: string;
  category: string;
  description: string;
  requiresApiKey: boolean;
  configured: boolean;
  status: ApiProviderStatus;
  rateLimit: {
    queueDepth: number;
    estimatedWaitMs: number;
    blockedUntil: string | null;
    minIntervalMs: number;
    rateLimited: boolean;
    dailyQuota: {
      limit: number;
      used: number;
      remaining: number;
      reserve: number;
      resetsAt: string;
      exceeded: boolean;
    } | null;
  };
  lastOutcome: ApiOutcome | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  requestCount: number;
  successCount: number;
  errorCount: number;
  rateLimitCount: number;
  lastResponseTimeMs: number | null;
  avgResponseTimeMs: number | null;
}

export interface ApiStatusSummary {
  checkedAt: string;
  total: number;
  ready: number;
  degraded: number;
  unconfigured: number;
  error: number;
  unknown: number;
}

export interface ApiStatusPayload {
  summary: ApiStatusSummary;
  providers: ApiProviderStatusSnapshot[];
}

interface ProviderRuntimeState {
  lastOutcome: ApiOutcome | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  requestCount: number;
  successCount: number;
  errorCount: number;
  rateLimitCount: number;
  lastResponseTimeMs: number | null;
  responseTimeTotalMs: number;
  responseTimeSamples: number;
}

const runtime = new Map<string, ProviderRuntimeState>();

function envSet(...keys: string[]): boolean {
  return keys.some((key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function getRuntime(providerId: string): ProviderRuntimeState {
  let state = runtime.get(providerId);

  if (!state) {
    state = {
      lastOutcome: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      rateLimitCount: 0,
      lastResponseTimeMs: null,
      responseTimeTotalMs: 0,
      responseTimeSamples: 0,
    };
    runtime.set(providerId, state);
  }

  return state;
}

export const API_PROVIDERS: ApiProviderDefinition[] = [
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    category: 'market',
    description: 'Quotes, fundamentals, and technical indicators',
    requiresApiKey: true,
    isConfigured: () =>
      envSet('ALPHA_VANTAGE_API_KEY', 'alphavantage_api_key', 'ALPHA_VANTAGE_KEY'),
  },
  {
    id: 'fmp',
    name: 'Financial Modeling Prep',
    category: 'market',
    description: 'Quotes, financials, news, and technical indicators',
    requiresApiKey: true,
    isConfigured: () => envSet('FMP_API_KEY', 'fmp_api_key', 'FPM_API_KEY', 'fpm_api_key'),
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    category: 'market',
    description: 'Quotes, profiles, news, candles, and company logos',
    requiresApiKey: true,
    isConfigured: () => envSet('FINNHUB_API_KEY', 'finnhub_api_key'),
  },
  {
    id: 'massive',
    name: 'Massive / Polygon',
    category: 'market',
    description: 'Market aggregates, snapshots, news, and financials',
    requiresApiKey: true,
    isConfigured: () =>
      envSet(
        'MASSIVE_API_KEY',
        'massive_api_key',
        'POLYGON_API_KEY',
        'polygon_api_key'
      ),
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    category: 'market',
    description: 'Public quotes and market screener data',
    requiresApiKey: false,
    isConfigured: () => true,
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    category: 'crypto',
    description: 'Cryptocurrency prices, market data, and coin search',
    requiresApiKey: false,
    isConfigured: () => true,
  },
  {
    id: 'gdelt',
    name: 'GDELT',
    category: 'news',
    description: 'Global news articles, tone, and geo queries',
    requiresApiKey: false,
    isConfigured: () => true,
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    category: 'news',
    description: 'Editorial news search and sections',
    requiresApiKey: true,
    isConfigured: () => envSet('GUARDIAN_API_KEY', 'guardian_api_key'),
  },
  {
    id: 'currentsapi',
    name: 'Currents API',
    category: 'news',
    description: 'Global headlines and news search',
    requiresApiKey: true,
    isConfigured: () => envSet('CURRENTSAPI_API_KEY', 'currentsapi_api_key'),
  },
  {
    id: 'gnews',
    name: 'GNews',
    category: 'news',
    description: 'News search and top headlines',
    requiresApiKey: true,
    isConfigured: () =>
      process.env.GNEWS_ENABLED === 'true' &&
      envSet('GNEWS_API_KEY', 'gnews_api_key'),
  },
  {
    id: 'rss',
    name: 'RSS',
    category: 'news',
    description: 'Government and regulatory RSS feeds',
    requiresApiKey: false,
    isConfigured: () => true,
  },
  {
    id: 'fred',
    name: 'FRED',
    category: 'macro',
    description: 'Federal Reserve economic time series',
    requiresApiKey: true,
    isConfigured: () => envSet('FRED_API_KEY', 'fred_api_key'),
  },
  {
    id: 'census',
    name: 'U.S. Census',
    category: 'macro',
    description: 'Demographic and economic census data',
    requiresApiKey: true,
    isConfigured: () => envSet('CENSUS_API_KEY', 'census_api_key'),
  },
  {
    id: 'lda',
    name: 'LDA.gov',
    category: 'government',
    description: 'Federal lobbying disclosures',
    requiresApiKey: true,
    isConfigured: () => envSet('LDA_API_KEY', 'lda_api_key'),
  },
  {
    id: 'usaspending',
    name: 'USAspending',
    category: 'government',
    description: 'Federal contracts, grants, and spending',
    requiresApiKey: false,
    isConfigured: () => true,
  },
  {
    id: 'edgar',
    name: 'SEC EDGAR',
    category: 'regulatory',
    description: 'SEC filings and XBRL financial facts',
    requiresApiKey: true,
    isConfigured: () => envSet('SEC_USER_AGENT', 'sec_user_agent'),
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    description: 'Retail sentiment and discussion',
    requiresApiKey: true,
    isConfigured: () =>
      envSet('REDDIT_CLIENT_ID', 'reddit_client_id') &&
      envSet('REDDIT_CLIENT_SECRET', 'reddit_client_secret'),
  },
  {
    id: 'stocktwits',
    name: 'StockTwits',
    category: 'social',
    description: 'Ticker sentiment streams',
    requiresApiKey: false,
    isConfigured: () => envSet('STOCKTWITS_CLIENT_ID', 'stocktwits_client_id'),
  },
  {
    id: 'googletrends',
    name: 'Google Trends',
    category: 'social',
    description: 'Search interest signals',
    requiresApiKey: false,
    isConfigured: () => true,
  },
  {
    id: 'serpapi',
    name: 'SerpAPI',
    category: 'social',
    description: 'Google Trends proxy via SerpAPI',
    requiresApiKey: true,
    isConfigured: () => envSet('SERPAPI_API_KEY', 'serpapi_api_key'),
  },
  {
    id: 'deepai',
    name: 'DeepAI',
    category: 'ai',
    description: 'LLM backend for agents',
    requiresApiKey: false,
    isConfigured: () => true,
  },
];

function resolveStatus(
  definition: ApiProviderDefinition,
  runtimeState: ProviderRuntimeState,
  rateLimited: boolean
): ApiProviderStatus {
  if (definition.requiresApiKey && !definition.isConfigured()) {
    return 'unconfigured';
  }

  if (rateLimited) {
    return 'degraded';
  }

  if (runtimeState.lastOutcome === 'rate_limited') {
    return 'degraded';
  }

  const dailyQuota = getRateLimitStatus(definition.id).dailyQuota;

  if (dailyQuota?.exceeded) {
    return 'degraded';
  }

  if (runtimeState.lastOutcome === 'error') {
    return 'error';
  }

  if (runtimeState.lastOutcome === 'success') {
    return 'ready';
  }

  return definition.isConfigured() ? 'unknown' : 'unconfigured';
}

export function recordApiOutcome(
  providerId: string,
  outcome: ApiOutcome,
  errorMessage?: string,
  responseTimeMs?: number
): void {
  const state = getRuntime(providerId);
  const now = new Date().toISOString();

  state.lastOutcome = outcome;
  state.requestCount += 1;

  if (typeof responseTimeMs === 'number' && Number.isFinite(responseTimeMs) && responseTimeMs >= 0) {
    state.lastResponseTimeMs = Math.round(responseTimeMs);
    state.responseTimeTotalMs += responseTimeMs;
    state.responseTimeSamples += 1;
  }

  if (outcome === 'success') {
    state.successCount += 1;
    state.lastSuccessAt = now;
    return;
  }

  if (outcome === 'rate_limited') {
    state.rateLimitCount += 1;
    state.lastErrorAt = now;
    state.lastError = errorMessage ?? 'rate limited';
    return;
  }

  state.errorCount += 1;
  state.lastErrorAt = now;
  state.lastError = errorMessage ?? 'request failed';
}

export function getProviderStatus(providerId: string): ApiProviderStatusSnapshot | null {
  const definition = API_PROVIDERS.find((provider) => provider.id === providerId);

  if (!definition) {
    return null;
  }

  const runtimeState = getRuntime(providerId);
  const rateLimit = getRateLimitStatus(providerId);
  const rateLimited = Boolean(rateLimit.blockedUntil);

  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    requiresApiKey: definition.requiresApiKey,
    configured: definition.isConfigured(),
    status: resolveStatus(definition, runtimeState, rateLimited),
    rateLimit: {
      queueDepth: rateLimit.queueDepth,
      estimatedWaitMs: rateLimit.estimatedWaitMs,
      blockedUntil: rateLimit.blockedUntil,
      minIntervalMs: rateLimit.minIntervalMs,
      rateLimited,
      dailyQuota: rateLimit.dailyQuota,
    },
    lastOutcome: runtimeState.lastOutcome,
    lastSuccessAt: runtimeState.lastSuccessAt,
    lastErrorAt: runtimeState.lastErrorAt,
    lastError: runtimeState.lastError,
    requestCount: runtimeState.requestCount,
    successCount: runtimeState.successCount,
    errorCount: runtimeState.errorCount,
    rateLimitCount: runtimeState.rateLimitCount,
    lastResponseTimeMs: runtimeState.lastResponseTimeMs,
    avgResponseTimeMs:
      runtimeState.responseTimeSamples > 0
        ? Math.round(runtimeState.responseTimeTotalMs / runtimeState.responseTimeSamples)
        : null,
  };
}

export function getAllApiStatus(): ApiStatusPayload {
  const providers = API_PROVIDERS.map((definition) => getProviderStatus(definition.id)!);

  const summary: ApiStatusSummary = {
    checkedAt: new Date().toISOString(),
    total: providers.length,
    ready: providers.filter((provider) => provider.status === 'ready').length,
    degraded: providers.filter((provider) => provider.status === 'degraded').length,
    unconfigured: providers.filter((provider) => provider.status === 'unconfigured').length,
    error: providers.filter((provider) => provider.status === 'error').length,
    unknown: providers.filter((provider) => provider.status === 'unknown').length,
  };

  return { summary, providers };
}
