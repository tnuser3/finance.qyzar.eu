import { logError } from './error-log';
import { getPool, query } from './pool';

const CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const inflightFetches = new Map<string, Promise<unknown>>();

let initialized = false;

export interface CacheOptions {
  bypassCache?: boolean;
  ttlMs?: number;
}

export interface StaleCacheOptions extends CacheOptions {
  staleMaxMs?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: Date;
  createdAt: Date;
}

async function ensureCacheTable(): Promise<void> {
  if (initialized) {
    return;
  }

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS cache_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_cache_store_expires_at
      ON cache_store (expires_at);
  `);

  initialized = true;
}

async function readCache<T>(key: string): Promise<T | null> {
  const entry = await readCacheEntry<T>(key);
  if (!entry || entry.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return entry.value;
}

export async function readCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  const result = await getPool().query<{
    value: T;
    expires_at: Date;
    created_at: Date;
  }>(
    `SELECT value, expires_at, created_at
     FROM cache_store
     WHERE key = $1`,
    [key]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    value: row.value,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function fetchAndStore<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  const existing = inflightFetches.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      const value = await fetcher();
      await writeCache(key, value, ttlMs);
      return value;
    } finally {
      inflightFetches.delete(key);
    }
  })();

  inflightFetches.set(key, promise);
  return promise;
}

async function writeCache<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): Promise<void> {
  await getPool().query(
    `INSERT INTO cache_store (key, value, expires_at)
     VALUES ($1, $2::jsonb, NOW() + ($3 || ' milliseconds')::INTERVAL)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
    [key, JSON.stringify(value), ttlMs]
  );
}

export async function init(): Promise<void> {
  await ensureCacheTable();
}

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  let canUseCache = !options.bypassCache;

  if (canUseCache) {
    try {
      await ensureCacheTable();
      const cachedValue = await readCache<T>(key);

      if (cachedValue !== null) {
        return cachedValue;
      }
    } catch (error) {
      logError(error, { source: 'infra/db/cache.ts - cached' });
      canUseCache = false;
    }
  }

  const value = await fetcher();

  if (canUseCache) {
    try {
      await writeCache(key, value, options.ttlMs ?? CACHE_TTL_MS);
    } catch (error) {
      logError(error, { source: 'infra/db/cache.ts - cached' });
    }
  }

  return value;
}

export async function cachedStaleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: StaleCacheOptions = {}
): Promise<T> {
  await ensureCacheTable();

  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const staleMaxMs = options.staleMaxMs ?? DEFAULT_STALE_MAX_MS;

  if (!options.bypassCache) {
    try {
      const entry = await readCacheEntry<T>(key);

      if (entry) {
        const now = Date.now();
        const isFresh = entry.expiresAt.getTime() > now;
        const ageMs = now - entry.createdAt.getTime();
        const withinStale = ageMs <= staleMaxMs;

        if (isFresh || withinStale) {
          if (!isFresh && withinStale) {
            void fetchAndStore(key, fetcher, ttlMs).catch((error) => {
              logError(error, { source: 'infra/db/cache.ts - cachedStaleWhileRevalidate' });
            });
          }

          return entry.value;
        }
      }
    } catch (error) {
      logError(error, { source: 'infra/db/cache.ts - cachedStaleWhileRevalidate' });
      await invalidate(key);
    }
  }

  try {
    return await fetchAndStore(key, fetcher, ttlMs);
  } catch (error) {
    logError(error, { source: 'infra/db/cache.ts - cachedStaleWhileRevalidate' });
    if (!options.bypassCache) {
      const entry = await readCacheEntry<T>(key);
      if (entry) {
        const ageMs = Date.now() - entry.createdAt.getTime();
        if (ageMs <= staleMaxMs) {
          return entry.value;
        }
      }
    }

    throw error;
  }
}

export async function store<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): Promise<void> {
  await ensureCacheTable();
  await writeCache(key, value, ttlMs);
}

export async function retrieve<T>(key: string): Promise<T | null> {
  await ensureCacheTable();
  return readCache<T>(key);
}

export async function invalidate(key: string): Promise<void> {
  await ensureCacheTable();
  await getPool().query(`DELETE FROM cache_store WHERE key = $1`, [key]);
}

export async function purgeExpiredCache(): Promise<number> {
  await ensureCacheTable();
  const result = await getPool().query(`DELETE FROM cache_store WHERE expires_at < NOW()`);
  return result.rowCount ?? 0;
}