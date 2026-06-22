"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { ChartMarker, MarketChartInput, NormalizedChartData } from "@/lib/chart-types";
import { normalizeMarketChartInput } from "@/lib/normalize-chart-data";
import { useMarketChart } from "@/hooks/use-market-chart";
import {
  CHART_MARKER_COLORS,
  CHART_SERIES_COLORS,
  chartUi,
} from "@/lib/chart-theme";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartTooltipPanel,
  ChartTooltipTitle,
  ChartTooltipValue,
} from "@/components/ui/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendBadge } from "@/components/ui/change-badge";
import { motionEnter } from "@/lib/motion";
import { cn } from "@/lib/utils";

const CHART_HEIGHT = 260;
const PADDING = { top: 12, right: 12, bottom: 40, left: 56 };

const MARKER_COLORS: Record<NonNullable<ChartMarker["severity"]>, string> =
  CHART_MARKER_COLORS;

interface HoverState {
  index: number;
  x: number;
  y: number;
}

export interface LineChartProps {
  data: NormalizedChartData;
  className?: string;
  height?: number;
}

function formatPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (value < 10) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAxisLabel(label: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) {
    const date = new Date(`${label.slice(0, 10)}T12:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  }

  return label.length > 8 ? `${label.slice(0, 8)}…` : label;
}

function buildLinePath(
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

export function LineChart({
  data,
  className = "",
  height = CHART_HEIGHT,
}: LineChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      setWidth(Math.max(node.clientWidth, 280));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 1);

  const allValues = useMemo(
    () => data.series.flatMap((series) => series.values),
    [data.series]
  );

  const bounds = useMemo(() => {
    if (allValues.length === 0) {
      return { minY: 0, maxY: 1 };
    }

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.08 || max * 0.02 || 1;

    return {
      minY: min - padding,
      maxY: max + padding,
    };
  }, [allValues]);

  const xTickIndexes = useMemo(() => {
    const count = data.labels.length;
    if (count <= 1) return [0];
    if (count <= 4) return Array.from({ length: count }, (_, index) => index);

    const indexes = new Set<number>([0, count - 1]);
    const middleCount = 3;

    for (let step = 1; step <= middleCount; step += 1) {
      indexes.add(Math.round((step / (middleCount + 1)) * (count - 1)));
    }

    return [...indexes].sort((a, b) => a - b);
  }, [data.labels.length]);

  const yTicks = useMemo(() => {
    const { minY, maxY } = bounds;
    return [maxY, (maxY + minY) / 2, minY];
  }, [bounds]);

  const updateHover = useCallback(
    (event: MouseEvent<SVGSVGElement>) => {
      if (data.labels.length === 0) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const relativeX = event.clientX - rect.left - PADDING.left;
      const clampedX = Math.max(0, Math.min(relativeX, plotWidth));
      const index =
        data.labels.length > 1
          ? Math.round((clampedX / plotWidth) * (data.labels.length - 1))
          : 0;

      setHover({
        index,
        x: PADDING.left + (data.labels.length > 1 ? (index / (data.labels.length - 1)) * plotWidth : 0),
        y: event.clientY - rect.top,
      });
    },
    [data.labels.length, plotWidth]
  );

  const clearHover = useCallback(() => {
    setHover(null);
  }, []);

  const hoveredLabel = hover != null ? data.labels[hover.index] : null;
  const hoveredValues = hover != null
    ? data.series.map((series) => ({
        name: series.name,
        color: series.color,
        value: series.values[hover.index],
      }))
    : [];

  const activeMarkers =
    hover != null
      ? (data.markers ?? []).filter((marker) => marker.index === hover.index)
      : [];

  if (allValues.length === 0) {
    return (
      <div className={cn(chartUi.emptyState, "h-48", className)}>
        Chart unavailable
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn(chartUi.chartSurface, className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label="Line chart"
        onMouseMove={updateHover}
        onMouseLeave={clearHover}
      >
        <defs>
          {data.series.map((series, index) => {
            const color =
              series.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];

            return (
            <linearGradient
              key={`${series.name}-${index}`}
              id={`${gradientId}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity="0.14" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            );
          })}
        </defs>

        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
        />

        {yTicks.map((tick, index) => {
          const y =
            PADDING.top +
            ((bounds.maxY - tick) / (bounds.maxY - bounds.minY || 1)) * plotHeight;

          return (
            <g key={`y-${index}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plotWidth}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <text
                x={PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground font-mono text-[10px]"
              >
                {formatPrice(tick)}
              </text>
            </g>
          );
        })}

        {xTickIndexes.map((index) => {
          const x =
            PADDING.left +
            (data.labels.length > 1 ? (index / (data.labels.length - 1)) * plotWidth : 0);

          return (
            <text
              key={`x-${index}`}
              x={x}
              y={height - 10}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] font-medium"
            >
              {formatAxisLabel(data.labels[index] ?? "")}
            </text>
          );
        })}

        <g transform={`translate(${PADDING.left} ${PADDING.top})`}>
          {data.series.map((series, index) => {
            const color =
              series.color ?? CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
            const path = buildLinePath(
              series.values,
              plotWidth,
              plotHeight,
              bounds.minY,
              bounds.maxY
            );

            if (!path) return null;

            const areaPath = `${path} L ${plotWidth.toFixed(2)} ${plotHeight.toFixed(2)} L 0 ${plotHeight.toFixed(2)} Z`;

            return (
              <g key={`${series.name}-${index}`}>
                <path d={areaPath} fill={`url(#${gradientId}-${index})`} />
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {(data.markers ?? []).map((marker, index) => {
            const x =
              data.labels.length > 1
                ? (marker.index / (data.labels.length - 1)) * plotWidth
                : 0;
            const color = MARKER_COLORS[marker.severity ?? "medium"];

            return (
              <g key={`${marker.at}-${index}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={plotHeight}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.8}
                />
                <circle cx={x} cy={8} r={3.5} fill={color} stroke="hsl(var(--background))" strokeWidth={1.5} />
              </g>
            );
          })}

          {hover != null ? (
            <line
              x1={hover.x - PADDING.left}
              y1={0}
              x2={hover.x - PADDING.left}
              y2={plotHeight}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
          ) : null}
        </g>
      </svg>

      {hover != null && hoveredLabel ? (
        <ChartTooltipPanel className="mt-4">
          <ChartTooltipTitle>{formatAxisLabel(hoveredLabel)}</ChartTooltipTitle>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {hoveredValues.map((entry) => (
              <ChartTooltipValue key={entry.name}>
                <span
                  className={chartUi.legendDot}
                  style={{ backgroundColor: entry.color }}
                />
                <span className="ml-1.5 text-foreground">{entry.name}</span>
                <span className="ml-1 font-semibold text-foreground">
                  {entry.value != null ? formatPrice(entry.value) : "—"}
                </span>
              </ChartTooltipValue>
            ))}
          </div>
          {activeMarkers.length > 0 ? (
            <div className="my-2 space-y-1.5 border-t border-border pt-2">
              {activeMarkers.map((marker) => (
                <div key={marker.at} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(chartUi.legendDot, "mt-1")}
                    style={{
                      backgroundColor: MARKER_COLORS[marker.severity ?? "medium"],
                    }}
                  />
                  <span>
                    {marker.label}
                    {marker.source ? (
                      <span className="text-muted-foreground/70"> · {marker.source}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </ChartTooltipPanel>
      ) : null}
    </div>
  );
}

export interface MarketLineChartProps {
  input?: MarketChartInput;
  ticker?: string;
  correlationId?: string;
  mode?: "market" | "company" | "correlation";
  days?: number;
  autoFetch?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
  height?: number;
}

export function MarketLineChart({
  input: inputProp,
  ticker,
  correlationId,
  mode = "market",
  days = 30,
  autoFetch = true,
  title,
  subtitle,
  className = "",
  height,
}: MarketLineChartProps) {
  const shouldFetch =
    autoFetch &&
    !inputProp &&
    Boolean(ticker || mode === "correlation" || mode === "company");

  const { input: fetchedInput, isLoading, usingFallback, error } = useMarketChart({
    ticker,
    days,
    correlationId,
    mode,
    enabled: shouldFetch,
  });

  const input = inputProp ?? fetchedInput ?? undefined;
  const data = input ? normalizeMarketChartInput(input) : null;

  const resolvedTitle =
    title ??
    (input?.kind === "widget" ? input.widget.title : undefined) ??
    (input?.kind === "correlationChart" ? "Correlation chart" : ticker ? `${ticker} chart` : "Market chart");

  const resolvedSubtitle =
    subtitle ??
    (input?.kind === "widget" ? input.widget.subtitle : undefined) ??
    (input?.kind === "priceSeries" && input.ticker ? input.ticker : ticker);

  if (isLoading && shouldFetch) {
    return (
      <Card className={cn(className)}>
        <CardHeader className="border-b border-border px-6 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
        </CardHeader>
        <CardContent className="px-6 py-4">
          <Skeleton className="h-56 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={cn(className)}>
        <CardHeader className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-sm">{resolvedTitle}</CardTitle>
            {shouldFetch ? (
              <Badge variant={usingFallback ? "outline" : "muted"}>
                {usingFallback ? "Sample" : "Current"}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <div className={chartUi.emptyState}>
            {error ?? "Chart unavailable"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pctChange = data.pctChange;

  return (
    <Card className={cn(motionEnter, className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 border-b border-border px-6 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{resolvedTitle}</CardTitle>
            {shouldFetch ? (
              <Badge variant="secondary" size="xs">
                Current
              </Badge>
            ) : null}
          </div>
          {resolvedSubtitle ? (
            <CardDescription className="text-xs">{resolvedSubtitle}</CardDescription>
          ) : null}
          {data.windowStart && data.windowEnd ? (
            <p className="text-[11px] text-muted-foreground/80">
              {formatAxisLabel(data.windowStart)} – {formatAxisLabel(data.windowEnd)}
            </p>
          ) : null}
        </div>

        <TrendBadge value={pctChange} size="default" />
      </CardHeader>

      <CardContent className="px-6 py-4">
        <LineChart data={data} height={height} />

        {data.markers && data.markers.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.markers.map((marker) => (
              <Badge key={marker.at} variant="outline" className="gap-1.5">
                <span
                  className={chartUi.legendDot}
                  style={{
                    backgroundColor: MARKER_COLORS[marker.severity ?? "medium"],
                  }}
                />
                {marker.label}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default MarketLineChart;
