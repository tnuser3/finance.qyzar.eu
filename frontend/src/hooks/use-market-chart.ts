"use client";

import { useEffect, useState } from "react";
import type { MarketChartInput } from "@/lib/chart-types";
import type { CacheMeta } from "@/lib/cache-types";
import {
  getCachedMarketChart,
  prefetchMarketChart,
  setCachedMarketChart,
} from "@/lib/market-chart-cache";
import { resolveMarketChartInput } from "@/lib/market-chart-api";
import { peekClientCache } from "@/lib/client-cache";

export interface UseMarketChartOptions {
  ticker?: string;
  days?: number;
  correlationId?: string;
  mode?: "market" | "company" | "correlation";
  assetType?: "stock" | "crypto";
  enabled?: boolean;
}

function chartTier(assetType: "stock" | "crypto"): "hot" | "cold" {
  return assetType === "crypto" ? "hot" : "cold";
}

export function useMarketChart(options: UseMarketChartOptions) {
  const {
    ticker,
    days = 7,
    correlationId,
    mode = "market",
    assetType = "stock",
    enabled = true,
  } = options;

  const [input, setInput] = useState<MarketChartInput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [cacheMeta, setCacheMeta] = useState<CacheMeta | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const canFetch =
      Boolean(ticker) ||
      mode === "correlation" ||
      mode === "company";

    if (!canFetch) {
      setIsLoading(false);
      setError(null);
      setInput(null);
      setIsStale(false);
      setCacheMeta(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setUsingFallback(false);

    let hasCached = false;

    if (mode === "market" && ticker) {
      const cached = peekClientCache<MarketChartInput>(
        "marketChart",
        {
          ticker: ticker.trim().toUpperCase(),
          assetType,
          days,
        },
        chartTier(assetType)
      );

      if (cached) {
        hasCached = true;
        setInput(cached.data);
        setIsStale(cached.isStale);
        setIsLoading(false);
      } else {
        const legacy = getCachedMarketChart({ ticker, assetType, days });
        if (legacy) {
          hasCached = true;
          setInput(legacy);
          setIsLoading(false);
        }
      }
    }

    if (!hasCached) {
      setIsLoading(true);
    }

    const fetchChart = async () => {
      if (mode === "market" && ticker) {
        return prefetchMarketChart({ ticker, assetType, days });
      }

      return resolveMarketChartInput({
        ticker,
        days,
        correlationId,
        mode,
        assetType,
      });
    };

    void fetchChart()
      .then((resolved) => {
        if (cancelled) return;
        if (!resolved) {
          throw new Error("no chart data returned");
        }
        if (mode === "market" && ticker) {
          setCachedMarketChart({ ticker, assetType, days }, resolved);
        }
        setInput(resolved);
        setUsingFallback(false);
        setIsLoading(false);
        setIsStale(false);
        setCacheMeta(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!hasCached) {
          setInput(null);
          setUsingFallback(true);
        }
        setIsLoading(false);
        setError(err instanceof Error ? err.message : "failed to load chart");
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, days, correlationId, mode, assetType, enabled]);

  return { input, isLoading, error, usingFallback, isStale, cacheMeta };
}
