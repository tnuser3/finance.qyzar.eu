import { asRecord } from '../reply';
import {
  buildWsCacheKey,
  cachedSWR,
  resolveWsPolicy,
  type CacheMeta,
  type WsCachePayload,
  type WsPolicyContext,
} from './index';

export function shouldBypassCache(payload: unknown): boolean {
  const record = asRecord(payload);
  return record.bypassCache === true || record.refresh === true;
}

export interface WithWsCacheOptions<T> {
  event: string;
  payload: unknown;
  keyParts: Record<string, string | number | undefined>;
  fetch: () => Promise<T>;
  policyContext?: Partial<WsPolicyContext>;
}

export interface WithWsCacheResult<T> {
  data: T;
  cache: CacheMeta;
}

export async function withWsCache<T>(
  options: WithWsCacheOptions<T>
): Promise<WithWsCacheResult<T>> {
  const bypassCache = shouldBypassCache(options.payload);
  const policyContext: WsPolicyContext = {
    event: options.event,
    ...options.policyContext,
  };
  const policy = resolveWsPolicy(policyContext);
  const key = buildWsCacheKey(options.event, options.keyParts);

  const result = await cachedSWR(key, options.fetch, {
    ttlMs: policy.ttlMs,
    staleMaxMs: policy.staleMaxMs,
    tier: policy.tier,
    bypassCache,
  });

  return {
    data: result.data,
    cache: result.meta,
  };
}
