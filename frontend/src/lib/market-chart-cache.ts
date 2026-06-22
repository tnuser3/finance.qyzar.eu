import type { MarketChartInput } from "@/lib/chart-types";
import type { CacheMeta } from "@/lib/cache-types";
import { buildCacheKey, getCachedWs, peekClientCache, writeClientCache } from "@/lib/client-cache";
import { resolveMarketChartInput } from "@/lib/market-chart-api";

export interface MarketChartCacheKey {
  ticker: string;
  assetType?: "stock" | "crypto";
  days?: number;
}

function chartTier(assetType: "stock" | "crypto"): "hot" | "cold" {
  return assetType === "crypto" ? "hot" : "cold";
}

function toKeyParts({ ticker, assetType = "stock", days = 7 }: MarketChartCacheKey) {
  return {
    ticker: ticker.trim().toUpperCase(),
    assetType,
    days,
  };
}

export function getCachedMarketChart(options: MarketChartCacheKey): MarketChartInput | null {
  const assetType = options.assetType ?? "stock";
  return peekClientCache<MarketChartInput>(
    "marketChart",
    toKeyParts(options),
    chartTier(assetType)
  )?.data ?? null;
}

export function setCachedMarketChart(
  options: MarketChartCacheKey,
  input: MarketChartInput
): void {
  writeClientCache("marketChart", toKeyParts(options), chartTier(options.assetType ?? "stock"), input);
}

export function prefetchMarketChart(
  options: MarketChartCacheKey
): Promise<MarketChartInput | null> {
  const ticker = options.ticker.trim().toUpperCase();
  if (!ticker) {
    return Promise.resolve(null);
  }

  const assetType = options.assetType ?? "stock";
  const cached = peekClientCache<MarketChartInput>(
    "marketChart",
    toKeyParts(options),
    chartTier(assetType)
  );

  if (cached && !cached.isStale) {
    return Promise.resolve(cached.data);
  }

  return getCachedWs({
    tier: chartTier(assetType),
    namespace: "marketChart",
    keyParts: toKeyParts(options),
    fetch: async (requestOptions) => {
      const input = await resolveMarketChartInput(
        {
          ticker,
          days: options.days ?? 7,
          assetType,
          mode: "market",
        },
        requestOptions
      );

      if (!input) {
        throw new Error("no chart data returned");
      }

      return input;
    },
  })
    .then((result) => result.data)
    .catch(() => null);
}

export function prefetchMarketCharts(
  targets: MarketChartCacheKey[]
): Promise<Array<MarketChartInput | null>> {
  const seen = new Set<string>();
  const unique = targets.filter((target) => {
    const key = buildCacheKey("marketChart", toKeyParts(target));
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(target.ticker.trim());
  });

  return Promise.all(unique.map((target) => prefetchMarketChart(target)));
}

export type { CacheMeta };
