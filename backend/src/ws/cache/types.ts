export type CacheTier = 'hot' | 'warm' | 'medium' | 'cold' | 'static';

export interface CacheMeta {
  fromCache: boolean;
  cachedAt: string;
  expiresAt: string;
  ttlMs: number;
  stale: boolean;
}

export interface CacheOptions {
  bypassCache?: boolean;
  ttlMs?: number;
  tier?: CacheTier;
  staleMaxMs?: number;
}

export interface CachedResult<T> {
  data: T;
  meta: CacheMeta;
}

export interface WsCachePayload {
  bypassCache?: boolean;
  refresh?: boolean;
}
