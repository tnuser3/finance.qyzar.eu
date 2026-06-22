import {
  clearClientCache,
  getCachedWs,
  getClientCacheAgeMs,
} from "@/lib/client-cache";
import { wsClient } from "@/lib/ws-client";

export type ApiProviderStatus =
  | "ready"
  | "degraded"
  | "unconfigured"
  | "error"
  | "unknown";

export type ApiOutcome = "success" | "error" | "rate_limited";

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
  };
  lastOutcome: ApiOutcome | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  requestCount: number;
  successCount: number;
  errorCount: number;
  rateLimitCount: number;
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

interface ViewApiStatusResponse extends Record<string, unknown> {
  ok?: boolean;
  summary?: ApiStatusSummary;
  providers?: ApiProviderStatusSnapshot[];
  error?: string;
}

export const API_STATUS_CACHE_TTL_MS = 15 * 60 * 1000;

function normalizeApiStatusResponse(
  response: ViewApiStatusResponse
): ApiStatusPayload {
  const summary = response.summary;
  const providers = response.providers;

  if (!summary || !Array.isArray(providers)) {
    throw new Error(response.error ?? "API status returned an invalid payload");
  }

  return { summary, providers };
}

export function clearApiStatusCache(): void {
  clearClientCache("viewApiStatus");
}

export async function fetchApiStatus(options: { bypassCache?: boolean } = {}): Promise<ApiStatusPayload> {
  const { data } = await getCachedWs({
    tier: "warm",
    namespace: "viewApiStatus",
    keyParts: { scope: "all" },
    bypassCache: options.bypassCache,
    fetch: async (requestOptions) => {
      const response = await wsClient.request<ViewApiStatusResponse>(
        "viewApiStatus",
        {},
        requestOptions
      );
      return normalizeApiStatusResponse(response);
    },
  });

  return data;
}

export function getApiStatusCacheAgeMs(): number | null {
  return getClientCacheAgeMs("viewApiStatus", { scope: "all" }, "warm");
}
