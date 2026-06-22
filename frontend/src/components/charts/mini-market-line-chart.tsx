"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { MarketChartInput, PriceBar } from "@/lib/chart-types";
import { useMarketChart } from "@/hooks/use-market-chart";
import {
  normalizeMarketChartInput,
  pctChangeForBars,
  slicePriceBarsLastDays,
} from "@/lib/normalize-chart-data";
import { chartUi, trendStrokeColor } from "@/lib/chart-theme";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TrendBadge } from "@/components/ui/change-badge";
import {
  ChartTooltipPanel,
  ChartTooltipTitle,
  ChartTooltipValue,
} from "@/components/ui/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { motionEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

const DEFAULT_DAYS = 7;
const CHART_HEIGHT = 112;
const TIMESTAMP_HEIGHT = 32;
const Y_AXIS_WIDTH = 72;
const AXIS_CHART_HEIGHT = 156;
const AXIS_FONT_CLASS = "fill-muted-foreground text-[9px] font-normal tabular-nums";
const LINE_STROKE_WIDTH = 1.25;
const HOVER_DOT_RADIUS = 3;
const AREA_FILL_OPACITY = 0.05;
const Y_TICK_COUNT = 4;
const X_TICK_COUNT = 5;
const GRID_STROKE = "hsl(var(--border))";

export interface MiniMarketLineChartProps {
  bars?: PriceBar[];
  input?: MarketChartInput;
  ticker?: string;
  correlationId?: string;
  mode?: "market" | "company" | "correlation";
  assetType?: "stock" | "crypto";
  days?: number;
  width?: number;
  className?: string;
  showTimestamps?: boolean;
  showAxisLabels?: boolean;
  showChange?: boolean;
  showHeader?: boolean;
  demoSeed?: number;
  autoFetch?: boolean;
}

function formatMiniPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (value < 10) {
    return value.toFixed(4);
  }

  return value.toFixed(2);
}

/** Compact axis label for x-axis endpoints. */
export function formatChartAxisDate(label: string, assetType: "stock" | "crypto"): string {
  const parsed = Date.parse(label);
  if (Number.isNaN(parsed)) {
    return label.slice(0, 10);
  }

  if (assetType === "crypto" && label.includes("T")) {
    return new Date(parsed).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatAxisPrice(value: number, assetType: "stock" | "crypto"): string {
  if (assetType === "crypto" && value >= 1000) {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
  }

  return formatMiniPrice(value);
}

/** Daily bar date → market-close timestamp label (4:00 PM ET). */
export function formatMarketTimestamp(label: string): string {
  const dateKey = label.slice(0, 10);
  const parsed = Date.parse(`${dateKey}T16:00:00-04:00`);

  if (Number.isNaN(parsed)) {
    return label;
  }

  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function buildYTicks(min: number, max: number, count: number): number[] {
  if (count <= 1) return [max];
  if (min === max) return [min];

  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return max - (max - min) * ratio;
  });
}

function buildTickIndices(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length === 1 || count <= 1) return [0];

  const indices = Array.from({ length: count }, (_, index) =>
    Math.round((index / (count - 1)) * (length - 1))
  );

  return [...new Set(indices)];
}

function valueToPlotY(
  value: number,
  plotHeight: number,
  minY: number,
  maxY: number
): number {
  return plotHeight - ((value - minY) / (maxY - minY || 1)) * plotHeight;
}

function buildSparkPath(
  values: number[],
  plotWidth: number,
  plotHeight: number,
  minY: number,
  maxY: number
): string {
  if (values.length === 0) return "";

  const range = maxY - minY || 1;
  const stepX = values.length > 1 ? plotWidth / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = plotHeight - ((value - minY) / range) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function resolveBars(
  props: MiniMarketLineChartProps
): { bars: PriceBar[]; ticker?: string } | null {
  const days = props.days ?? DEFAULT_DAYS;

  if (props.bars?.length) {
    return {
      bars: slicePriceBarsLastDays(props.bars, days),
      ticker: props.ticker,
    };
  }

  if (props.input?.kind === "priceSeries") {
    return {
      bars: slicePriceBarsLastDays(props.input.bars, days),
      ticker: props.ticker ?? props.input.ticker,
    };
  }

  if (props.input) {
    const normalized = normalizeMarketChartInput(props.input);
    if (!normalized) return null;

    const bars = normalized.labels.map((date, index) => ({
      date,
      close: normalized.series[0]?.values[index] ?? Number.NaN,
    })).filter((bar) => Number.isFinite(bar.close));

    return {
      bars: slicePriceBarsLastDays(bars, days),
      ticker: props.ticker,
    };
  }

  return null;
}

export function MiniMarketLineChart({
  bars: barsProp,
  input: inputProp,
  ticker,
  correlationId,
  mode = "market",
  assetType = "stock",
  days = DEFAULT_DAYS,
  width = 264,
  className = "",
  showTimestamps = true,
  showAxisLabels = false,
  showChange = true,
  showHeader = true,
  demoSeed,
  autoFetch = true,
}: MiniMarketLineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const padding = useMemo(() => {
    const timestampBand = showTimestamps ? TIMESTAMP_HEIGHT : 0;
    return {
      top: 12,
      right: 12,
      bottom: timestampBand + 8,
      left: showAxisLabels ? Y_AXIS_WIDTH : 4,
    };
  }, [showAxisLabels, showTimestamps]);

  const chartHeight = showAxisLabels ? AXIS_CHART_HEIGHT : CHART_HEIGHT;
  const totalHeight = chartHeight + (showTimestamps ? TIMESTAMP_HEIGHT : 0);

  const shouldFetch =
    autoFetch && !barsProp && !inputProp && Boolean(ticker || mode === "correlation");

  const { input: fetchedInput, isLoading, usingFallback } = useMarketChart({
    ticker,
    days,
    correlationId,
    mode,
    assetType,
    enabled: shouldFetch,
  });

  const input = inputProp ?? fetchedInput ?? undefined;

  const demoBars = useMemo(
    () =>
      usingFallback && shouldFetch
        ? buildDemoMiniChartBars(days, demoSeed ?? (assetType === "crypto" ? 50_000 : 100))
        : null,
    [usingFallback, shouldFetch, days, demoSeed, assetType]
  );

  const resolved = useMemo(
    () =>
      resolveBars({
        bars: barsProp ?? demoBars ?? undefined,
        input,
        ticker,
        days,
        assetType,
      }),
    [barsProp, demoBars, input, ticker, days, assetType]
  );

  const bars = resolved?.bars ?? [];
  const values = bars.map((bar) => bar.close);
  const labels = bars.map((bar) => bar.date);

  const bounds = useMemo(() => {
    if (values.length === 0) return { minY: 0, maxY: 1 };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const rangePadding = (max - min) * 0.06 || max * 0.008 || 0.5;

    return { minY: min - rangePadding, maxY: max + rangePadding };
  }, [values]);

  const pctChange = useMemo(() => pctChangeForBars(bars), [bars]);
  const isUp = pctChange != null ? pctChange >= 0 : values.at(-1)! >= values[0]!;
  const strokeColor = trendStrokeColor(pctChange, isUp);

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const path = buildSparkPath(values, plotWidth, plotHeight, bounds.minY, bounds.maxY);

  const yTicks = useMemo(
    () => buildYTicks(bounds.minY, bounds.maxY, Y_TICK_COUNT),
    [bounds.minY, bounds.maxY]
  );

  const xTickIndices = useMemo(
    () => buildTickIndices(labels.length, showTimestamps ? X_TICK_COUNT : 0),
    [labels.length, showTimestamps]
  );

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    if (labels.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left - padding.left;
    const clampedX = Math.max(0, Math.min(relativeX, plotWidth));
    const index =
      labels.length > 1
        ? Math.round((clampedX / plotWidth) * (labels.length - 1))
        : 0;

    setHoverIndex(index);
  };

  if (isLoading && shouldFetch) {
    return (
      <Card
        size="compact"
        className={cn("inline-flex h-56 flex-col gap-2", className)}
        style={{ width }}
      >
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-32 flex-1 rounded-md" />
      </Card>
    );
  }

  if (bars.length === 0) {
    return (
      <Card
        size="compact"
        className={cn(chartUi.emptyState, "h-48 text-xs", className)}
        style={{ width }}
      >
        Unable to load chart
      </Card>
    );
  }

  const hoverBar = hoverIndex != null ? bars[hoverIndex] : null;

  return (
    <Card
      size="compact"
      className={cn("relative inline-flex flex-col gap-2", motionEnter, className)}
      style={{ width }}
      aria-label={`${days}-day ${assetType === "crypto" ? "crypto" : "market"} mini chart`}
    >
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          {ticker ? (
            <span className="text-[11px] font-medium tracking-wide text-foreground">
              {ticker}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-muted-foreground">
              {days}D
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {shouldFetch ? (
              <Badge variant={usingFallback ? "outline" : "muted"} size="xs">
                {usingFallback ? "Sample" : "Current"}
              </Badge>
            ) : null}
            {showChange && pctChange != null ? (
              <TrendBadge value={pctChange} size="xs" />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={cn(chartUi.chartSurface, "border-border/40 bg-background/50 px-0.5 py-1")}>
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="w-full touch-none select-none"
          role="img"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <g transform={`translate(${padding.left} ${padding.top})`}>
            {showAxisLabels || showTimestamps ? (
              <>
                {yTicks.map((tick) => {
                  const y = valueToPlotY(tick, plotHeight, bounds.minY, bounds.maxY);
                  return (
                    <line
                      key={`grid-y-${tick}`}
                      x1={0}
                      y1={y}
                      x2={plotWidth}
                      y2={y}
                      stroke={GRID_STROKE}
                      strokeWidth={0.75}
                      opacity={0.55}
                    />
                  );
                })}
                {xTickIndices.map((index) => {
                  const x =
                    labels.length > 1 ? (index / (labels.length - 1)) * plotWidth : 0;
                  return (
                    <line
                      key={`grid-x-${index}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={plotHeight}
                      stroke={GRID_STROKE}
                      strokeWidth={0.75}
                      opacity={0.35}
                    />
                  );
                })}
              </>
            ) : null}

            <path
              d={`${path} L ${plotWidth.toFixed(2)} ${plotHeight.toFixed(2)} L 0 ${plotHeight.toFixed(2)} Z`}
              fill={strokeColor}
              fillOpacity={AREA_FILL_OPACITY}
            />
            <path
              d={path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={LINE_STROKE_WIDTH}
              strokeLinejoin="miter"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
            />

            {hoverIndex != null ? (
              <>
                <line
                  x1={
                    labels.length > 1
                      ? (hoverIndex / (labels.length - 1)) * plotWidth
                      : 0
                  }
                  y1={0}
                  x2={
                    labels.length > 1
                      ? (hoverIndex / (labels.length - 1)) * plotWidth
                      : 0
                  }
                  y2={plotHeight}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={0.75}
                  strokeDasharray="2 3"
                  opacity={0.5}
                />
                <circle
                  cx={
                    labels.length > 1
                      ? (hoverIndex / (labels.length - 1)) * plotWidth
                      : 0
                  }
                  cy={valueToPlotY(
                    values[hoverIndex]!,
                    plotHeight,
                    bounds.minY,
                    bounds.maxY
                  )}
                  r={HOVER_DOT_RADIUS}
                  fill={strokeColor}
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                />
              </>
            ) : null}
          </g>

          {showAxisLabels
            ? yTicks.map((tick) => {
                const y =
                  padding.top +
                  valueToPlotY(tick, plotHeight, bounds.minY, bounds.maxY);
                return (
                  <text
                    key={`y-label-${tick}`}
                    x={padding.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    className={AXIS_FONT_CLASS}
                  >
                    {formatAxisPrice(tick, assetType)}
                  </text>
                );
              })
            : null}

          {showTimestamps
            ? xTickIndices.map((index) => {
                const x =
                  padding.left +
                  (labels.length > 1 ? (index / (labels.length - 1)) * plotWidth : 0);
                const anchor =
                  index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle";

                return (
                  <text
                    key={`x-label-${index}`}
                    x={x}
                    y={chartHeight + 2}
                    textAnchor={anchor}
                    className={AXIS_FONT_CLASS}
                  >
                    {formatChartAxisDate(labels[index] ?? "", assetType)}
                  </text>
                );
              })
            : null}
        </svg>
      </div>

      {hoverBar ? (
        <ChartTooltipPanel className="pointer-events-none absolute -top-1 left-1/2 z-10 min-w-max -translate-x-1/2 -translate-y-full text-[10px]">
          <ChartTooltipTitle>
            {assetType === "crypto"
              ? formatChartAxisDate(hoverBar.date, assetType)
              : formatMarketTimestamp(hoverBar.date)}
          </ChartTooltipTitle>
          <ChartTooltipValue className="font-semibold text-foreground">
            {formatMiniPrice(hoverBar.close)}
          </ChartTooltipValue>
        </ChartTooltipPanel>
      ) : null}
    </Card>
  );
}

export function buildDemoMiniChartBars(days = DEFAULT_DAYS, seed = 100): PriceBar[] {
  const bars: PriceBar[] = [];
  let price = seed;
  const now = new Date();
  const volatility = seed >= 1000 ? seed * 0.012 : seed * 0.025;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - offset);
    price += (Math.sin(offset * 1.7 + seed) * 0.5 + 0.02) * volatility;

    bars.push({
      date: date.toISOString().slice(0, 10),
      close: Math.round(price * 100) / 100,
    });
  }

  return bars;
}

export default MiniMarketLineChart;
