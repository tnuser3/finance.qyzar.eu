export type CacheTier = "hot" | "warm" | "medium" | "cold" | "static";

export interface CacheMeta {
  fromCache?: boolean;
  cachedAt?: string;
  expiresAt?: string;
  ttlMs?: number;
  stale?: boolean;
}

export interface CachedWsResponse<T> {
  data: T;
  meta: CacheMeta;
  isStale: boolean;
}
