import {
  detectRateLimitMs,
  markDailyQuotaExhausted,
  markRateLimited,
  recordProviderRequest,
  RateLimitError,
  runQueued,
} from './ratelimit';
import { recordApiOutcome } from '../../providers/api-status';
import { logError } from '../db/error-log';

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 30_000;

const PROVIDER_FETCH_TIMEOUT_MS: Record<string, number> = {
  gdelt: Number(process.env.GDELT_FETCH_TIMEOUT_MS) || 60_000,
};

export async function apiFetch(
  provider: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return runQueued(provider, async () => {
    const controller = new AbortController();
    const timeoutMs = PROVIDER_FETCH_TIMEOUT_MS[provider] ?? FETCH_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    try {
      const res = await fetch(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
      const bodyText = await res.text();
      const responseTimeMs = Date.now() - started;
      recordProviderRequest(provider);
      const retryMs = detectRateLimitMs(res.status, res.headers, bodyText);

      if (retryMs) {
        if (res.status === 402) {
          markDailyQuotaExhausted(provider);
        } else {
          markRateLimited(provider, retryMs);
        }
        recordApiOutcome(provider, 'rate_limited', `HTTP ${res.status}`, responseTimeMs);
        throw new RateLimitError(provider, retryMs);
      }

      if (res.ok) {
        recordApiOutcome(provider, 'success', undefined, responseTimeMs);
      } else {
        recordApiOutcome(provider, 'error', `HTTP ${res.status}`, responseTimeMs);
      }

      return new Response(bodyText, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch (error) {
      logError(error, { source: 'infra/http/fetch.ts - apiFetch' });
      if (!(error instanceof RateLimitError)) {
        const message = error instanceof Error ? error.message : String(error);
        recordApiOutcome(provider, 'error', message, Date.now() - started);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function apiFetchJson<T>(
  provider: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await apiFetch(provider, url, init);

  if (!res.ok) {
    throw new Error(`${provider} request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export { runQueued, RateLimitUnavailableError } from './ratelimit';
