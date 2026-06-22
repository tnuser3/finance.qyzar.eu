import type { CacheMeta, CacheTier } from "@/lib/cache-types";

const STORAGE_PREFIX = "finance3:cache:";

export const CACHE_HOT_TTL_MS = 60_000;
export const CACHE_WARM_TTL_MS = 15 * 60 * 1000;
export const CACHE_MEDIUM_TTL_MS = 4 * 60 * 60 * 1000;
export const CACHE_COLD_TTL_MS = 6 * 60 * 60 * 1000;
export const CACHE_STATIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

const TIER_TTL: Record<CacheTier, number> = {
  hot: CACHE_HOT_TTL_MS,
  warm: CACHE_WARM_TTL_MS,
  medium: CACHE_MEDIUM_TTL_MS,
  cold: CACHE_COLD_TTL_MS,
  static: CACHE_STATIC_TTL_MS,
};

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  ttlMs: number;
  serverMeta?: CacheMeta;
}

interface GetCachedWsOptions<T> {
  tier: CacheTier;
  namespace: string;
  keyParts: Record<string, string | number | boolean | undefined>;
  fetch: (options?: { bypassCache?: boolean }) => Promise<T | { data: T; meta?: CacheMeta }>;
  extractServerMeta?: (response: T) => CacheMeta | undefined;
  bypassCache?: boolean;
}

const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const revalidationTimers = new Map<string, ReturnType<typeof setTimeout>>();

function tierTtl(tier: CacheTier): number {
  return TIER_TTL[tier];
}

function shouldPersist(tier: CacheTier): boolean {
  return tier !== "hot";
}

export function buildCacheKey(
  namespace: string,
  keyParts: Record<string, string | number | boolean | undefined>
): string {
  const segments = Object.entries(keyParts)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);

  return segments.length > 0 ? `${namespace}:${segments.join(":")}` : namespace;
}

function readSession<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Ignore quota errors.
  }
}

function removeSession(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // Ignore storage errors.
  }
}

function readEntry<T>(key: string, tier: CacheTier): CacheEntry<T> | null {
  const fromMemory = memory.get(key) as CacheEntry<T> | undefined;
  if (fromMemory) {
    return fromMemory;
  }

  if (!shouldPersist(tier)) {
    return null;
  }

  const fromSession = readSession<T>(key);
  if (fromSession) {
    memory.set(key, fromSession);
    return fromSession;
  }

  return null;
}

function writeEntry<T>(key: string, tier: CacheTier, entry: CacheEntry<T>): void {
  memory.set(key, entry);
  if (shouldPersist(tier)) {
    writeSession(key, entry);
  }
}

function isFresh(entry: CacheEntry<unknown>, now = Date.now()): boolean {
  return entry.expiresAt > now;
}

function isUsable(entry: CacheEntry<unknown>, now = Date.now()): boolean {
  return now - entry.cachedAt <= CACHE_STALE_MAX_MS;
}

function metaFromEntry(entry: CacheEntry<unknown>, isStale: boolean): CacheMeta {
  return {
    fromCache: true,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    ttlMs: entry.ttlMs,
    stale: isStale,
    ...entry.serverMeta,
  };
}

function resolveExpiry(
  tier: CacheTier,
  serverMeta: CacheMeta | undefined,
  cachedAt: number
): { expiresAt: number; ttlMs: number } {
  if (serverMeta?.expiresAt) {
    const expiresAt = Date.parse(serverMeta.expiresAt);
    if (Number.isFinite(expiresAt)) {
      return {
        expiresAt,
        ttlMs: serverMeta.ttlMs ?? tierTtl(tier),
      };
    }
  }

  const ttlMs = serverMeta?.ttlMs ?? tierTtl(tier);
  return {
    expiresAt: cachedAt + ttlMs,
    ttlMs,
  };
}

function scheduleRevalidation<T>(
  key: string,
  tier: CacheTier,
  fetchFresh: () => Promise<T>
): void {
  const existing = revalidationTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    revalidationTimers.delete(key);
    void fetchFresh().catch(() => {
      // Background refresh failures are non-fatal.
    });
  }, 0);

  revalidationTimers.set(key, timer);
}

export function clearClientCache(namespace?: string): void {
  const prefix = namespace ? `${namespace}:` : undefined;

  for (const key of [...memory.keys()]) {
    if (!prefix || key.startsWith(prefix)) {
      memory.delete(key);
      removeSession(key);
    }
  }

  if (typeof window !== "undefined") {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.sessionStorage.key(index);
      if (!storageKey?.startsWith(STORAGE_PREFIX)) {
        continue;
      }

      const cacheKey = storageKey.slice(STORAGE_PREFIX.length);
      if (!prefix || cacheKey.startsWith(prefix)) {
        window.sessionStorage.removeItem(storageKey);
      }
    }
  }
}

export async function getCachedWs<T>(
  options: GetCachedWsOptions<T>
): Promise<{ data: T; meta: CacheMeta; isStale: boolean }> {
  const key = buildCacheKey(options.namespace, options.keyParts);
  const now = Date.now();
  const bypassCache = options.bypassCache === true;

  const fetchFresh = async (force = false): Promise<T> => {
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }

    const request = options
      .fetch({ bypassCache: force || bypassCache })
      .then((raw) => {
        const data =
          raw && typeof raw === "object" && "data" in raw
            ? (raw as { data: T; meta?: CacheMeta }).data
            : (raw as T);
        const cachedAt = Date.now();
        const serverMeta =
          raw && typeof raw === "object" && "data" in raw
            ? (raw as { data: T; meta?: CacheMeta }).meta
            : options.extractServerMeta?.(data);
        const { expiresAt, ttlMs } = resolveExpiry(options.tier, serverMeta, cachedAt);
        writeEntry(key, options.tier, {
          data,
          cachedAt,
          expiresAt,
          ttlMs,
          serverMeta,
        });
        return data;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, request);
    return request;
  };

  if (!bypassCache) {
    const entry = readEntry<T>(key, options.tier);
    if (entry && isUsable(entry, now)) {
      const stale = !isFresh(entry, now);

      if (stale) {
        scheduleRevalidation(key, options.tier, () => fetchFresh(true));
      }

      return {
        data: entry.data,
        meta: metaFromEntry(entry, stale),
        isStale: stale,
      };
    }
  }

  const data = await fetchFresh(bypassCache);
  const stored = readEntry<T>(key, options.tier);
  const meta: CacheMeta = stored
    ? metaFromEntry(stored, false)
    : {
        fromCache: false,
        cachedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + tierTtl(options.tier)).toISOString(),
        ttlMs: tierTtl(options.tier),
        stale: false,
      };

  return { data, meta, isStale: false };
}

export function peekClientCache<T>(
  namespace: string,
  keyParts: Record<string, string | number | boolean | undefined>,
  tier: CacheTier
): { data: T; isStale: boolean } | null {
  const key = buildCacheKey(namespace, keyParts);
  const entry = readEntry<T>(key, tier);
  if (!entry || !isUsable(entry)) {
    return null;
  }

  return {
    data: entry.data,
    isStale: !isFresh(entry),
  };
}

export function writeClientCache<T>(
  namespace: string,
  keyParts: Record<string, string | number | boolean | undefined>,
  tier: CacheTier,
  data: T,
  serverMeta?: CacheMeta
): void {
  const key = buildCacheKey(namespace, keyParts);
  const cachedAt = Date.now();
  const { expiresAt, ttlMs } = resolveExpiry(tier, serverMeta, cachedAt);
  writeEntry(key, tier, {
    data,
    cachedAt,
    expiresAt,
    ttlMs,
    serverMeta,
  });
}

export function getClientCacheAgeMs(
  namespace: string,
  keyParts: Record<string, string | number | boolean | undefined>,
  tier: CacheTier
): number | null {
  const key = buildCacheKey(namespace, keyParts);
  const entry = readEntry<unknown>(key, tier);
  if (!entry) {
    return null;
  }

  return Date.now() - entry.cachedAt;
}
