"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { prefetchMarketCharts } from "@/lib/market-chart-cache";

export interface TickerChartTarget {
  id: string;
  symbol: string;
  assetType: "stock" | "crypto";
  days: number;
  getElement: () => HTMLElement | null;
}

interface TickerMarqueeContextValue {
  paused: boolean;
  setChartOpen: (open: boolean) => void;
  registerChartTarget: (target: TickerChartTarget) => void;
  unregisterChartTarget: (id: string) => void;
  prefetchVisibleCharts: (viewport: HTMLElement) => void;
}

const TickerMarqueeContext = createContext<TickerMarqueeContextValue | null>(null);

const CHART_PREFETCH_DAYS = 7;

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function TickerMarqueeProvider({ children }: { children: ReactNode }) {
  const openCountRef = useRef(0);
  const chartTargetsRef = useRef<Map<string, TickerChartTarget>>(new Map());
  const [paused, setPaused] = useState(false);

  const setChartOpen = useCallback((open: boolean) => {
    openCountRef.current = Math.max(0, openCountRef.current + (open ? 1 : -1));
    setPaused(openCountRef.current > 0);
  }, []);

  const registerChartTarget = useCallback((target: TickerChartTarget) => {
    chartTargetsRef.current.set(target.id, target);
  }, []);

  const unregisterChartTarget = useCallback((id: string) => {
    chartTargetsRef.current.delete(id);
  }, []);

  const prefetchVisibleCharts = useCallback((viewport: HTMLElement) => {
    const viewportRect = viewport.getBoundingClientRect();
    const visible = new Map<
      string,
      { ticker: string; assetType: "stock" | "crypto"; days: number }
    >();

    for (const target of chartTargetsRef.current.values()) {
      const element = target.getElement();
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (!rectsIntersect(rect, viewportRect)) continue;

      const key = `${target.assetType}:${target.symbol}:${target.days}`;
      if (!visible.has(key)) {
        visible.set(key, {
          ticker: target.symbol,
          assetType: target.assetType,
          days: target.days,
        });
      }
    }

    if (visible.size === 0) return;

    void prefetchMarketCharts([...visible.values()]);
  }, []);

  const value = useMemo(
    () => ({
      paused,
      setChartOpen,
      registerChartTarget,
      unregisterChartTarget,
      prefetchVisibleCharts,
    }),
    [paused, setChartOpen, registerChartTarget, unregisterChartTarget, prefetchVisibleCharts]
  );

  return (
    <TickerMarqueeContext.Provider value={value}>{children}</TickerMarqueeContext.Provider>
  );
}

export function useTickerMarquee() {
  return useContext(TickerMarqueeContext);
}

export { CHART_PREFETCH_DAYS };
