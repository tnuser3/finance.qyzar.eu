import {
  cachedStaleWhileRevalidate,
  readCacheEntry,
} from '../../infra/db/cache';
import { CACHE_DEFAULT_TTL_MS, CACHE_STALE_MAX_MS, resolveWsPolicy, tierTtl, type WsPolicyContext } from './policy';
import type { CacheMeta, CacheOptions, CachedResult, CacheTier } from './types';

export type { CacheMeta, CacheOptions, CachedResult, CacheTier, WsCachePayload } from './types';
export {
  CACHE_COLD_TTL_MS,
  CACHE_DEFAULT_TTL_MS,
  CACHE_HOT_TTL_MS,
  CACHE_INTRADAY_TTL_MS,
  CACHE_MEDIUM_TTL_MS,
  CACHE_STATIC_TTL_MS,
  CACHE_STALE_MAX_MS,
  CACHE_WARM_TTL_MS,
  resolveWsPolicy,
  tierTtl,
  type ResolvedPolicy,
  type WsPolicyContext,
} from './policy';

export function buildKey(namespace: string, parts: Record<string, string | number | undefined>): string {
  const segments = Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);

  return segments.length > 0 ? `${namespace}:${segments.join(':')}` : namespace;
}

export function buildWsCacheKey(event: string, parts: Record<string, string | number | undefined>): string {
  return buildKey(`ws:${event}`, parts);
}

function buildMeta(
  entry: { expiresAt: Date; createdAt: Date } | null,
  ttlMs: number,
  fromCache: boolean,
  now: number
): CacheMeta {
  const cachedAt = entry?.createdAt ?? new Date(now);
  const expiresAt = entry?.expiresAt ?? new Date(now + ttlMs);

  return {
    fromCache,
    cachedAt: cachedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlMs,
    stale: entry ? entry.expiresAt.getTime() <= now : false,
  };
}

export async function cachedSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<CachedResult<T>> {
  const policy = options.tier
    ? { ttlMs: tierTtl(options.tier), staleMaxMs: options.staleMaxMs ?? CACHE_STALE_MAX_MS }
    : { ttlMs: CACHE_DEFAULT_TTL_MS, staleMaxMs: options.staleMaxMs ?? CACHE_STALE_MAX_MS };

  const ttlMs = options.ttlMs ?? policy.ttlMs;
  const staleMaxMs = options.staleMaxMs ?? policy.staleMaxMs;
  const bypassCache = options.bypassCache === true;
  const now = Date.now();

  const before = bypassCache ? null : await readCacheEntry<T>(key);
  const fromCache = Boolean(before && before.expiresAt.getTime() > now);

  const data = await cachedStaleWhileRevalidate(key, fetcher, {
    ttlMs,
    staleMaxMs,
    bypassCache,
  });

  const after = await readCacheEntry<T>(key);
  const entry = after ?? before;

  return {
    data,
    meta: buildMeta(entry, ttlMs, fromCache, now),
  };
}

export function resolveTtl(context: WsPolicyContext): number {
  return resolveWsPolicy(context).ttlMs;
}


export { cached, invalidate, retrieve, store } from '../../infra/db/cache';
