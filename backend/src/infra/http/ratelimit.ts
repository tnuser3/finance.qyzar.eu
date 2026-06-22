import { logError } from '../db/error-log';
export const MAX_QUEUE_WAIT_MS = 2 * 60 * 1000;

export class RateLimitError extends Error {
  readonly provider: string;
  readonly retryAfterMs: number;

  constructor(provider: string, retryAfterMs: number) {
    super(`${provider} rate limited — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

export class RateLimitUnavailableError extends Error {
  readonly provider: string;
  readonly availableAt: number;
  readonly retryAfterMs: number;

  constructor(provider: string, availableAt: number) {
    const retryAfterMs = Math.max(0, availableAt - Date.now());
    const minutes = Math.ceil(retryAfterMs / 60_000);

    super(
      `${provider} API is temporarily unavailable due to rate limiting. ` +
        `Cooldown ends at ${new Date(availableAt).toISOString()} (~${minutes} min). ` +
        `Use a different data source until the rate limit clears.`
    );

    this.name = 'RateLimitUnavailableError';
    this.provider = provider;
    this.availableAt = availableAt;
    this.retryAfterMs = retryAfterMs;
  }
}

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  enqueuedAt: number;
}

interface ProviderState {
  queue: QueueItem<unknown>[];
  processing: boolean;
  lastRequestAt: number;
  blockedUntil: number;
  minIntervalMs: number;
  consecutiveRateLimits: number;
  dailyCount: number;
  dailyWindowKey: string;
  dailyLimit: number | null;
  dailyReserve: number;
}

const DEFAULT_INTERVAL_MS = Number(process.env.COLLECTOR_REQUEST_INTERVAL_MS) || 600;

const PROVIDER_DAILY_LIMITS: Record<string, { limit: number; reserve: number }> = {
  fmp: {
    limit: Number(process.env.FMP_DAILY_LIMIT) || 250,
    reserve: Number(process.env.FMP_DAILY_RESERVE) || 10,
  },
};

const PROVIDER_INTERVALS: Record<string, number> = {
  alphavantage: 12_000,
  fmp: 2_000,
  finnhub: 1_100,
  massive: 12_000,
  edgar: 150,
  lda: 500,
  reddit: 1_000,
  fred: 200,
  census: 500,
  gdelt: Number(process.env.GDELT_MIN_INTERVAL_MS) || 5_500,
  guardian: 500,
  currentsapi: 500,
  gnews: 1_000,
  googletrends: 2_000,
  serpapi: 1_000,
  rss: 300,
  usaspending: 500,
  yahoo: 300,
  stocktwits: 1_000,
  deepai: 500,
  coingecko: 2_100,
};

const providers = new Map<string, ProviderState>();

function utcDateKey(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function msUntilUtcMidnight(at = new Date()): number {
  const midnight = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() + 1
  );

  return Math.max(60_000, midnight - at.getTime());
}

function resetDailyWindow(state: ProviderState): void {
  const today = utcDateKey();

  if (state.dailyWindowKey !== today) {
    state.dailyWindowKey = today;
    state.dailyCount = 0;
  }
}

function getState(provider: string): ProviderState {
  let state = providers.get(provider);

  if (!state) {
    const dailyConfig = PROVIDER_DAILY_LIMITS[provider];

    state = {
      queue: [],
      processing: false,
      lastRequestAt: 0,
      blockedUntil: 0,
      minIntervalMs: PROVIDER_INTERVALS[provider] ?? DEFAULT_INTERVAL_MS,
      consecutiveRateLimits: 0,
      dailyCount: 0,
      dailyWindowKey: utcDateKey(),
      dailyLimit: dailyConfig?.limit ?? null,
      dailyReserve: dailyConfig?.reserve ?? 0,
    };
    providers.set(provider, state);
  }

  resetDailyWindow(state);

  return state;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (!Number.isNaN(seconds)) {
    return Math.max(1_000, seconds * 1_000);
  }

  const date = Date.parse(value);

  if (!Number.isNaN(date)) {
    return Math.max(1_000, date - Date.now());
  }

  return null;
}

export function detectRateLimitMs(
  status: number,
  headers: Headers,
  bodyText?: string
): number | null {
  if (status === 429) {
    return parseRetryAfter(headers.get('Retry-After')) ?? 60_000;
  }

  if (status === 402) {
    return msUntilUtcMidnight();
  }

  if (status === 503) {
    return parseRetryAfter(headers.get('Retry-After')) ?? 30_000;
  }

  if (!bodyText) {
    return null;
  }

  const lower = bodyText.toLowerCase();

  const patterns = [
    'rate limit',
    'too many requests',
    'call frequency',
    'thank you for using alpha vantage',
    'api key has been throttled',
    'exceeded the maximum',
    'requests per',
    'slow down',
    'temporarily blocked',
    'quota exceeded',
    'daily limit',
    'limit reach',
    'payment required',
    'upgrade your plan',
    'premium endpoint',
    'limit requests to one every',
    'please limit requests',
  ];

  if (patterns.some((pattern) => lower.includes(pattern))) {
    if (
      lower.includes('daily limit') ||
      lower.includes('limit reach') ||
      lower.includes('payment required') ||
      lower.includes('upgrade your plan')
    ) {
      return msUntilUtcMidnight();
    }

    return 60_000;
  }

  try {
    const json = JSON.parse(bodyText) as Record<string, unknown>;
    const note = String(json.Note ?? json.Information ?? json.message ?? json.error ?? '');

    if (
      note &&
      patterns.some((pattern) => note.toLowerCase().includes(pattern))
    ) {
      const lowerNote = note.toLowerCase();

      if (
        lowerNote.includes('daily limit') ||
        lowerNote.includes('limit reach') ||
        lowerNote.includes('payment required') ||
        lowerNote.includes('upgrade your plan')
      ) {
        return msUntilUtcMidnight();
      }

      return 60_000;
    }
  } catch (error) {
      logError(error, { source: 'infra/http/ratelimit.ts - detectRateLimitMs' });

  }

  return null;
}

export function markRateLimited(provider: string, retryAfterMs: number): void {
  const state = getState(provider);
  state.consecutiveRateLimits += 1;
  state.blockedUntil = Math.max(
    state.blockedUntil,
    Date.now() + retryAfterMs
  );
  state.minIntervalMs = Math.min(
    60_000,
    state.minIntervalMs * (1 + state.consecutiveRateLimits * 0.5)
  );
}

export function markDailyQuotaExhausted(provider: string): void {
  const state = getState(provider);

  if (state.dailyLimit !== null) {
    state.dailyCount = state.dailyLimit;
  }

  markRateLimited(provider, msUntilUtcMidnight());
}

export function recordProviderRequest(provider: string): void {
  const state = getState(provider);

  if (state.dailyLimit === null) {
    return;
  }

  state.dailyCount += 1;

  const effectiveLimit = Math.max(1, state.dailyLimit - state.dailyReserve);

  if (state.dailyCount >= effectiveLimit) {
    markRateLimited(provider, msUntilUtcMidnight());
  }
}

export function isDailyQuotaExceeded(provider: string): boolean {
  const state = getState(provider);

  if (state.dailyLimit === null) {
    return false;
  }

  const effectiveLimit = Math.max(1, state.dailyLimit - state.dailyReserve);
  return state.dailyCount >= effectiveLimit;
}

export function getDailyQuotaStatus(provider: string): {
  limit: number | null;
  used: number;
  remaining: number | null;
  reserve: number;
  resetsAt: string;
  exceeded: boolean;
} | null {
  const state = getState(provider);

  if (state.dailyLimit === null) {
    return null;
  }

  const effectiveLimit = Math.max(1, state.dailyLimit - state.dailyReserve);
  const remaining = Math.max(0, effectiveLimit - state.dailyCount);
  const resetsAt = new Date(Date.now() + msUntilUtcMidnight()).toISOString();

  return {
    limit: state.dailyLimit,
    used: state.dailyCount,
    remaining,
    reserve: state.dailyReserve,
    resetsAt,
    exceeded: state.dailyCount >= effectiveLimit,
  };
}

export function clearRateLimitBackoff(provider: string): void {
  const state = getState(provider);
  state.consecutiveRateLimits = 0;
}

export function estimateWaitMs(provider: string): number {
  const state = getState(provider);
  const now = Date.now();
  const blockWait = Math.max(0, state.blockedUntil - now);
  const intervalWait = Math.max(0, state.lastRequestAt + state.minIntervalMs - now);
  const queueWait = state.queue.length * state.minIntervalMs;

  return blockWait + intervalWait + queueWait;
}

export function getRateLimitStatus(provider: string): {
  provider: string;
  queueDepth: number;
  estimatedWaitMs: number;
  blockedUntil: string | null;
  minIntervalMs: number;
  dailyQuota: ReturnType<typeof getDailyQuotaStatus>;
} {
  const state = getState(provider);

  return {
    provider,
    queueDepth: state.queue.length,
    estimatedWaitMs: estimateWaitMs(provider),
    blockedUntil:
      state.blockedUntil > Date.now()
        ? new Date(state.blockedUntil).toISOString()
        : null,
    minIntervalMs: state.minIntervalMs,
    dailyQuota: getDailyQuotaStatus(provider),
  };
}

async function processQueue(provider: string): Promise<void> {
  const state = getState(provider);

  if (state.processing) {
    return;
  }

  state.processing = true;

  try {
    while (state.queue.length > 0) {
      const now = Date.now();
      const waitUntil = Math.max(
        state.blockedUntil,
        state.lastRequestAt + state.minIntervalMs
      );

      if (waitUntil > now) {
        await sleep(waitUntil - now);
      }

      const item = state.queue[0] as QueueItem<unknown>;

      if (Date.now() - item.enqueuedAt > MAX_QUEUE_WAIT_MS) {
        state.queue.shift();
        item.reject(new RateLimitUnavailableError(provider, state.blockedUntil));
        continue;
      }

      state.queue.shift();

      if (isDailyQuotaExceeded(provider)) {
        markDailyQuotaExhausted(provider);
        item.reject(new RateLimitUnavailableError(provider, state.blockedUntil));
        continue;
      }

      try {
        const result = await item.fn();
        state.lastRequestAt = Date.now();
        clearRateLimitBackoff(provider);
        item.resolve(result);
      } catch (error) {
      logError(error, { source: 'infra/http/ratelimit.ts - processQueue' });
        if (error instanceof RateLimitError) {
          const remainingBudget =
            MAX_QUEUE_WAIT_MS - (Date.now() - item.enqueuedAt);

          if (error.retryAfterMs <= remainingBudget) {
            state.queue.unshift(item);
            await sleep(error.retryAfterMs);
            continue;
          }

          item.reject(new RateLimitUnavailableError(provider, state.blockedUntil));
          continue;
        }

        item.reject(error);
      }
    }
  } finally {
    state.processing = false;

    if (state.queue.length > 0) {
      void processQueue(provider);
    }
  }
}

export function runQueued<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  const estimated = estimateWaitMs(provider);

  if (estimated > MAX_QUEUE_WAIT_MS) {
    const state = getState(provider);
    const availableAt = Math.max(state.blockedUntil, Date.now() + estimated);
    return Promise.reject(new RateLimitUnavailableError(provider, availableAt));
  }

  return new Promise<T>((resolve, reject) => {
    const state = getState(provider);

    state.queue.push({
      fn: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      enqueuedAt: Date.now(),
    });

    void processQueue(provider);
  });
}

export function providerFromCommand(commandName: string, category?: string): string {
  if (category && category !== 'system') {
    return category;
  }

  const prefix = commandName.split('_')[0];
  return prefix || 'default';
}
