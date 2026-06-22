import type {
  ChartMarker,
  CorrelationChartWidgetData,
  EvidenceWidget,
  LineChartWidgetData,
  MarketChartInput,
  NormalizedChartData,
  PriceBar,
} from "./chart-types";

import { CHART_SERIES_COLORS } from "./chart-theme";

const DEFAULT_SERIES_COLORS = [...CHART_SERIES_COLORS];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function parseSeverity(value: unknown): "low" | "medium" | "high" | undefined {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return undefined;
}

function markerDateKey(value: string): string {
  return value.slice(0, 10);
}

function findNearestLabelIndex(labels: string[], at: string): number {
  if (labels.length === 0) return 0;

  const target = markerDateKey(at);
  const exact = labels.findIndex((label) => markerDateKey(label) === target);
  if (exact >= 0) return exact;

  const targetTime = Date.parse(at);
  if (!Number.isFinite(targetTime)) return 0;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < labels.length; index += 1) {
    const labelTime = Date.parse(labels[index]!);
    if (!Number.isFinite(labelTime)) continue;

    const distance = Math.abs(labelTime - targetTime);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function normalizeMarkers(
  labels: string[],
  markers: CorrelationChartWidgetData["markers"]
): ChartMarker[] {
  if (!markers?.length) return [];

  return markers.map((marker) => ({
    at: marker.at,
    label: marker.label,
    severity: marker.severity,
    source: marker.source,
    index: findNearestLabelIndex(labels, marker.at),
  }));
}

function withSeriesColors(series: NormalizedChartData["series"]): NormalizedChartData["series"] {
  return series.map((entry, index) => ({
    ...entry,
    color: entry.color ?? DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length],
  }));
}

export function fromPriceSeries(
  bars: PriceBar[],
  ticker?: string
): NormalizedChartData {
  return {
    labels: bars.map((bar) => bar.date),
    series: withSeriesColors([
      {
        name: ticker ? `${ticker} close` : "Close",
        values: bars.map((bar) => bar.close),
      },
    ]),
  };
}

/** Keep bars within the last N calendar days (supports intraday timestamps). */
export function slicePriceBarsLastDays(bars: PriceBar[], days = 7): PriceBar[] {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return sorted;

  const lastTime = Date.parse(sorted[sorted.length - 1]!.date);
  if (!Number.isFinite(lastTime)) {
    return sorted.length <= days ? sorted : sorted.slice(-days);
  }

  const cutoff = lastTime - days * 86_400_000;
  const windowed = sorted.filter((bar) => {
    const time = Date.parse(bar.date);
    return Number.isFinite(time) && time >= cutoff;
  });

  if (windowed.length > 0) {
    return downsamplePriceBars(windowed, days * 24);
  }

  return sorted.length <= days ? sorted : sorted.slice(-days);
}

function downsamplePriceBars(bars: PriceBar[], maxPoints: number): PriceBar[] {
  if (bars.length <= maxPoints) return bars;

  const step = Math.ceil(bars.length / maxPoints);
  return bars.filter((_, index) => index % step === 0 || index === bars.length - 1);
}

export function pctChangeForBars(bars: PriceBar[]): number | undefined {
  if (bars.length < 2) return undefined;

  const first = bars[0]!.close;
  const last = bars[bars.length - 1]!.close;
  if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) return undefined;

  return Math.round(((last - first) / first) * 10000) / 100;
}

export function miniChartInputFromBars(
  bars: PriceBar[],
  options?: { days?: number; ticker?: string }
): MarketChartInput | null {
  const sliced = slicePriceBarsLastDays(bars, options?.days ?? 7);
  if (sliced.length === 0) return null;

  return {
    kind: "priceSeries",
    bars: sliced,
    ticker: options?.ticker,
  };
}

export function fromLineChartWidget(data: LineChartWidgetData): NormalizedChartData {
  return {
    labels: data.labels,
    series: withSeriesColors(data.series),
  };
}

export function fromCorrelationChartWidget(
  data: CorrelationChartWidgetData,
  ticker?: string
): NormalizedChartData {
  const labels = data.labels;
  const values = data.values;

  return {
    labels,
    series: withSeriesColors([
      {
        name: ticker ? `${ticker} price` : "Price",
        values,
      },
    ]),
    markers: normalizeMarkers(labels, data.markers),
    pctChange: data.pctChange,
    windowStart: data.windowStart,
    windowEnd: data.windowEnd,
  };
}

export function parseLineChartWidgetData(
  data: Record<string, unknown>
): LineChartWidgetData | null {
  const labels = asStringArray(data.labels);
  const rawSeries = Array.isArray(data.series) ? data.series : [];

  const series = rawSeries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const name = String(row.name ?? "Series");
      const values = asNumberArray(row.values);
      if (values.length === 0) return null;

      return {
        name,
        values,
        color: row.color ? String(row.color) : undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (labels.length === 0 || series.length === 0) return null;

  return { labels, series };
}

export function parseCorrelationChartWidgetData(
  data: Record<string, unknown>
): CorrelationChartWidgetData | null {
  const labels = asStringArray(data.labels);
  const values = asNumberArray(data.values);
  if (labels.length === 0 || values.length === 0) return null;

  const rawMarkers = Array.isArray(data.markers) ? data.markers : [];
  const markers = rawMarkers
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const at = String(row.at ?? "");
      const label = String(row.label ?? "");
      if (!at || !label) return null;

      return {
        at,
        label,
        severity: parseSeverity(row.severity),
        source: row.source ? String(row.source) : undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    labels,
    values,
    markers,
    windowStart: data.windowStart ? String(data.windowStart) : undefined,
    windowEnd: data.windowEnd ? String(data.windowEnd) : undefined,
    pctChange:
      data.pctChange != null && Number.isFinite(Number(data.pctChange))
        ? Number(data.pctChange)
        : undefined,
  };
}

export function fromEvidenceWidget(widget: EvidenceWidget): NormalizedChartData | null {
  if (widget.type === "line_chart") {
    const parsed = parseLineChartWidgetData(widget.data);
    return parsed ? fromLineChartWidget(parsed) : null;
  }

  if (widget.type === "correlation_chart") {
    const parsed = parseCorrelationChartWidgetData(widget.data);
    return parsed ? fromCorrelationChartWidget(parsed) : null;
  }

  return null;
}

export function normalizeMarketChartInput(input: MarketChartInput): NormalizedChartData | null {
  switch (input.kind) {
    case "priceSeries":
      if (input.bars.length === 0) return null;
      return fromPriceSeries(input.bars, input.ticker);
    case "lineChart":
      return fromLineChartWidget(input.data);
    case "correlationChart":
      return fromCorrelationChartWidget(input.data, input.ticker);
    case "widget":
      return fromEvidenceWidget(input.widget);
    default:
      return null;
  }
}

/** `viewCompany` reply: `{ priceSeries?: PriceBar[] }` when `from`/`to` are sent. */
export function chartInputFromViewCompany(options: {
  priceSeries?: PriceBar[] | null;
  ticker?: string;
}): MarketChartInput | null {
  if (!options.priceSeries?.length) return null;

  return {
    kind: "priceSeries",
    bars: options.priceSeries,
    ticker: options.ticker,
  };
}

/** `viewMarketCorrelations` item or timeline correlation widget payload. */
export function chartInputFromCorrelation(options: {
  widgets?: EvidenceWidget[];
  primaryTicker?: string;
}): MarketChartInput | null {
  const widget = options.widgets?.find(
    (entry) => entry.type === "correlation_chart" || entry.type === "line_chart"
  );

  if (widget) {
    return { kind: "widget", widget };
  }

  return null;
}

/** Any evidence widget list (e.g. `viewCompany.reports[].widgets`). */
export function chartInputFromWidgets(
  widgets: EvidenceWidget[] | undefined,
  preferredType: "correlation_chart" | "line_chart" = "line_chart"
): MarketChartInput | null {
  if (!widgets?.length) return null;

  const widget =
    widgets.find((entry) => entry.type === preferredType) ??
    widgets.find((entry) => entry.type === "line_chart" || entry.type === "correlation_chart");

  return widget ? { kind: "widget", widget } : null;
}
