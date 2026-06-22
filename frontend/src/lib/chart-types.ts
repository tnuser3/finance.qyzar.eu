export interface PriceBar {
  date: string;
  close: number;
}

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartMarker {
  at: string;
  label: string;
  severity?: "low" | "medium" | "high";
  source?: string;
  index: number;
}

export interface NormalizedChartData {
  labels: string[];
  series: ChartSeries[];
  markers?: ChartMarker[];
  pctChange?: number;
  windowStart?: string;
  windowEnd?: string;
}

export interface LineChartWidgetData {
  labels: string[];
  series: ChartSeries[];
}

export interface CorrelationChartWidgetData {
  labels: string[];
  values: number[];
  markers?: Array<{
    at: string;
    label: string;
    severity?: "low" | "medium" | "high";
    source?: string;
  }>;
  windowStart?: string;
  windowEnd?: string;
  pctChange?: number;
}

export interface EvidenceWidget {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  source?: string;
  priority?: number;
  data: Record<string, unknown>;
}

export type MarketChartInput =
  | { kind: "priceSeries"; bars: PriceBar[]; ticker?: string }
  | { kind: "lineChart"; data: LineChartWidgetData }
  | { kind: "correlationChart"; data: CorrelationChartWidgetData; ticker?: string }
  | { kind: "widget"; widget: EvidenceWidget };
