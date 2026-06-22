import type { MarketChartInput } from "@/lib/chart-types";
import type { CacheMeta } from "@/lib/cache-types";
import {
  chartInputFromCorrelation,
  chartInputFromViewCompany,
  chartInputFromWidgets,
} from "@/lib/normalize-chart-data";
import { wsClient, type WsRequestOptions } from "@/lib/ws-client";

interface ViewStockChartResponse extends Record<string, unknown> {
  ok?: boolean;
  ticker?: string;
  days?: number;
  bars?: import("@/lib/chart-types").PriceBar[];
  cache?: CacheMeta;
  error?: string;
}

interface ViewCompanyResponse extends Record<string, unknown> {
  ok?: boolean;
  priceSeries?: import("@/lib/chart-types").PriceBar[];
  company?: { ticker?: string };
  widgets?: import("@/lib/chart-types").EvidenceWidget[];
  reports?: Array<{ widgets?: import("@/lib/chart-types").EvidenceWidget[] }>;
  cache?: CacheMeta;
  error?: string;
}

interface CorrelationRecord {
  id?: string;
  primaryTicker?: string;
  widgets?: import("@/lib/chart-types").EvidenceWidget[];
}

interface ViewMarketCorrelationsResponse extends Record<string, unknown> {
  ok?: boolean;
  correlations?: CorrelationRecord[];
  error?: string;
}

interface ViewMarketTimelineResponse extends Record<string, unknown> {
  ok?: boolean;
  correlation?: CorrelationRecord | null;
  error?: string;
}

interface ViewCryptoChartResponse extends Record<string, unknown> {
  ok?: boolean;
  symbol?: string;
  days?: number;
  bars?: import("@/lib/chart-types").PriceBar[];
  cache?: CacheMeta;
  error?: string;
}

export async function fetchStockChartBars(
  ticker: string,
  days = 7,
  requestOptions: WsRequestOptions = {}
): Promise<import("@/lib/chart-types").PriceBar[]> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) {
    throw new Error("ticker is required");
  }

  const response = await wsClient.request<ViewStockChartResponse>(
    "viewStockChart",
    {
      ticker: symbol,
      days,
    },
    requestOptions
  );

  const bars = response.bars ?? [];
  if (bars.length === 0) {
    throw new Error(response.error ?? `no chart data for ${symbol}`);
  }

  return bars;
}

export async function fetchCryptoChartBars(
  symbol: string,
  days = 7,
  requestOptions: WsRequestOptions = {}
): Promise<import("@/lib/chart-types").PriceBar[]> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    throw new Error("symbol is required");
  }

  const response = await wsClient.request<ViewCryptoChartResponse>(
    "viewCryptoChart",
    {
      symbol: normalized,
      days,
    },
    requestOptions
  );

  if (response.ok === false) {
    throw new Error(response.error ?? `no chart data for ${normalized}`);
  }

  const bars = response.bars ?? [];
  if (bars.length === 0) {
    throw new Error(response.error ?? `no chart data for ${normalized}`);
  }

  return bars;
}

export async function fetchCompanyChartInput(
  options: {
    ticker: string;
    days?: number;
  },
  requestOptions: WsRequestOptions = {}
): Promise<MarketChartInput | null> {
  const ticker = options.ticker.trim().toUpperCase();
  const days = options.days ?? 30;
  const to = new Date().toISOString();
  const from = new Date(Date.now() - days * 86_400_000).toISOString();

  const response = await wsClient.request<ViewCompanyResponse>(
    "viewCompany",
    {
      ticker,
      from,
      to,
    },
    requestOptions
  );

  const priceInput = chartInputFromViewCompany({
    priceSeries: response.priceSeries,
    ticker: response.company?.ticker ?? ticker,
  });

  if (priceInput) return priceInput;

  const widgetInput =
    chartInputFromWidgets(response.widgets) ??
    chartInputFromWidgets(response.reports?.[0]?.widgets);

  return widgetInput;
}

export async function fetchCorrelationChartInput(options: {
  correlationId?: string;
  ticker?: string;
}): Promise<MarketChartInput | null> {
  if (options.correlationId) {
    const timeline = await wsClient.request<ViewMarketTimelineResponse>(
      "viewMarketTimeline",
      {
        correlationId: options.correlationId,
      }
    );

    const fromTimeline = chartInputFromCorrelation({
      widgets: timeline.correlation?.widgets,
      primaryTicker: timeline.correlation?.primaryTicker,
    });

    if (fromTimeline) return fromTimeline;
  }

  const response = await wsClient.request<ViewMarketCorrelationsResponse>(
    "viewMarketCorrelations",
    {
      ticker: options.ticker?.trim().toUpperCase(),
      limit: 1,
    }
  );

  const correlation = response.correlations?.[0];
  return chartInputFromCorrelation({
    widgets: correlation?.widgets,
    primaryTicker: correlation?.primaryTicker ?? options.ticker,
  });
}

export async function resolveMarketChartInput(
  options: {
    ticker?: string;
    days?: number;
    correlationId?: string;
    mode?: "market" | "company" | "correlation";
    assetType?: "stock" | "crypto";
  },
  requestOptions: WsRequestOptions = {}
): Promise<MarketChartInput | null> {
  const mode = options.mode ?? "market";
  const ticker = options.ticker?.trim().toUpperCase();
  const assetType = options.assetType ?? "stock";

  if (mode === "correlation") {
    return fetchCorrelationChartInput({
      correlationId: options.correlationId,
      ticker,
    });
  }

  if (mode === "company" && ticker) {
    return fetchCompanyChartInput(
      {
        ticker,
        days: options.days,
      },
      requestOptions
    );
  }

  if (ticker) {
    const bars =
      assetType === "crypto"
        ? await fetchCryptoChartBars(ticker, options.days ?? 7, requestOptions)
        : await fetchStockChartBars(ticker, options.days ?? 7, requestOptions);
    return { kind: "priceSeries", bars, ticker };
  }

  return null;
}
