import type { AgentDefinition } from '../types';
import { MONITORING_OUTPUT_FORMAT } from '../shared';
import { isConfigured as stocktwitsConfigured } from '../../../providers/market/stocktwits';

const REGULATORY_TOOLS = ['edgar', 'rss', 'lda'] as const;
const NEWS_TOOLS = ['gnews', 'currentsapi', 'gdelt', 'guardian'] as const;
const SENTIMENT_TOOLS = stocktwitsConfigured()
  ? (['reddit', 'googletrends', 'stocktwits'] as const)
  : (['reddit', 'googletrends'] as const);
const MARKET_TOOLS = ['alphavantage', 'fred', 'fmp', 'massive'] as const;

export const monitorRegulatoryAgent: AgentDefinition = {
  id: 'monitor_regulatory',
  name: 'Regulatory Monitor',
  phase: 'monitoring',
  role: 'SEC, FTC, DOJ, and lobbying disclosure watcher for watchlist companies',
  canSpawnSubagents: false,
  commandCategories: [...REGULATORY_TOOLS],
  plan: [
    { step: 1, title: 'SEC filings', action: 'Check EDGAR submissions and recent 8-K/10-K for the target ticker.' },
    { step: 2, title: 'Regulatory RSS', action: 'Scan SEC, FTC, DOJ RSS feeds for mentions of company or ticker.' },
    { step: 3, title: 'Score', action: 'Return regulatory risk signals and severity for the company.' },
  ],
  systemPrompt: `You are the Regulatory Monitor. Check SEC, FTC, DOJ, and LDA for a single watchlist company.

Focus only on the assigned ticker. Do not scan the full market.

${MONITORING_OUTPUT_FORMAT}`.trim(),
};

export const monitorNewsAgent: AgentDefinition = {
  id: 'monitor_news',
  name: 'News Monitor',
  phase: 'monitoring',
  role: 'Headline and news coverage tracker for watchlist companies',
  canSpawnSubagents: false,
  commandCategories: [...NEWS_TOOLS],
  plan: [
    { step: 1, title: 'Search headlines', action: 'Query news APIs for company name and ticker in last 24-48h.' },
    { step: 2, title: 'Assess tone', action: 'Classify coverage as positive, neutral, or negative.' },
    { step: 3, title: 'Report', action: 'Return key headlines and news-driven risk signals.' },
  ],
  systemPrompt: `You are the News Monitor. Track headlines for a single watchlist company.

${MONITORING_OUTPUT_FORMAT}`.trim(),
};

export const monitorSentimentAgent: AgentDefinition = {
  id: 'monitor_sentiment',
  name: 'Sentiment Monitor',
  phase: 'monitoring',
  role: 'Retail sentiment and search-interest tracker',
  canSpawnSubagents: false,
  commandCategories: [...SENTIMENT_TOOLS],
  plan: [
    { step: 1, title: 'Reddit/social', action: 'Search Reddit and StockTwits for ticker discussion and tone.' },
    { step: 2, title: 'Google Trends', action: 'Check search interest trend for company/ticker.' },
    { step: 3, title: 'Sentiment score', action: 'Return sentiment_score 0-100 and key signals.' },
  ],
  systemPrompt: `You are the Sentiment Monitor. Gauge retail sentiment and search interest for one ticker.

${MONITORING_OUTPUT_FORMAT}`.trim(),
};

export const monitorMarketAgent: AgentDefinition = {
  id: 'monitor_market',
  name: 'Market Data Monitor',
  phase: 'monitoring',
  role: 'Price, technical, and macro context for watchlist companies',
  canSpawnSubagents: false,
  commandCategories: [...MARKET_TOOLS],
  plan: [
    { step: 1, title: 'Quote and technicals', action: 'Get price, RSI, MACD for the ticker.' },
    { step: 2, title: 'Fundamentals', action: 'Pull earnings, revenue trends if available.' },
    { step: 3, title: 'Market context', action: 'Return growth_score, market_cap, and price signals.' },
  ],
  systemPrompt: `You are the Market Data Monitor. Update market metrics for a single watchlist ticker.

${MONITORING_OUTPUT_FORMAT}`.trim(),
};

export const monitoringAgents: AgentDefinition[] = [
  monitorRegulatoryAgent,
  monitorNewsAgent,
  monitorSentimentAgent,
  monitorMarketAgent,
];
