export type {
  ChartMarker,
  ChartSeries,
  CorrelationChartWidgetData,
  EvidenceWidget,
  LineChartWidgetData,
  MarketChartInput,
  NormalizedChartData,
  PriceBar,
} from "@/lib/chart-types";

export {
  chartInputFromCorrelation,
  chartInputFromViewCompany,
  chartInputFromWidgets,
  fromCorrelationChartWidget,
  fromEvidenceWidget,
  fromLineChartWidget,
  fromPriceSeries,
  miniChartInputFromBars,
  normalizeMarketChartInput,
  parseCorrelationChartWidgetData,
  parseLineChartWidgetData,
  pctChangeForBars,
  slicePriceBarsLastDays,
} from "@/lib/normalize-chart-data";

export {
  LineChart,
  MarketLineChart,
  type LineChartProps,
  type MarketLineChartProps,
} from "./line-chart";

export {
  MiniMarketLineChart,
  buildDemoMiniChartBars,
  formatMarketTimestamp,
  type MiniMarketLineChartProps,
} from "./mini-market-line-chart";
