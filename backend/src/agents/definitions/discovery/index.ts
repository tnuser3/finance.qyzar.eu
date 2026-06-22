import type { AgentDefinition } from '../types';
import { DISCOVERY_OPPORTUNITY_FORMAT, ENGLISH_ONLY_AGENT_RULE, SUBAGENT_RULES } from '../shared';

const COMMODITY_TOOLS = ['gdelt', 'guardian', 'rss', 'fred', 'fmp', 'alphavantage'] as const;
const OPPORTUNIST_TOOLS = ['gdelt', 'currentsapi', 'guardian', 'googletrends', 'reddit', 'fmp'] as const;
const CONSERVATION_TOOLS = ['fmp', 'finnhub', 'alphavantage', 'rss', 'fred', 'guardian'] as const;
const CRYPTO_TOOLS = ['coingecko', 'reddit', 'stocktwits', 'gdelt', 'guardian'] as const;
const MACRO_TOOLS = ['fred', 'census', 'gdelt', 'rss', 'alphavantage', 'fmp', 'guardian'] as const;
const EARNINGS_TOOLS = ['fmp', 'finnhub', 'alphavantage', 'massive', 'gdelt', 'edgar'] as const;
const TECHNICAL_TOOLS = ['fmp', 'finnhub', 'alphavantage', 'massive', 'gdelt'] as const;

export const commoditiesAgent: AgentDefinition = {
  id: 'commodities',
  name: 'Commodities Analyst',
  phase: 'discovery',
  role: 'Global commodity supply chain and pricing analyst',
  canSpawnSubagents: true,
  commandCategories: [...COMMODITY_TOOLS],
  plan: [
    { step: 1, title: 'Map commodity universe', action: 'Identify oil, gold, silver, copper, grain, water, chips, lithium, gas, and other traded inputs.' },
    { step: 2, title: 'Gather supply chain signals', action: 'Search news for disruptions, sanctions, logistics, weather, OPEC, export bans, fab capacity.' },
    { step: 3, title: 'Price and historical context', action: 'Use market data tools. Compare to historical patterns and seasonality.' },
    { step: 4, title: 'Business impact linkage', action: 'List exposed industries, public companies, margin impact.' },
    { step: 5, title: 'Deliver findings', action: 'Return findings per commodity with evidence and stats.' },
  ],
  systemPrompt: `You are the Commodities Analyst agent in a finance research pipeline.

Mission: Review global supply chains, spot prices, and historical patterns for traded commodities and explain how they affect businesses.

${SUBAGENT_RULES}
- Spawn subagents per commodity cluster (energy, metals, ag, semiconductors).
- Include stats: trend direction, volatility (low/medium/high), supply/demand bias.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};

export const futureOpportunistAgent: AgentDefinition = {
  id: 'future_opportunist',
  name: 'Future Opportunist',
  phase: 'discovery',
  role: 'Emerging market, IPO, and demand-shift scout',
  canSpawnSubagents: true,
  commandCategories: [...OPPORTUNIST_TOOLS],
  plan: [
    { step: 1, title: 'Scan IPO pipeline', action: 'Search for upcoming IPOs, listings, SPAC mergers, growth narratives.' },
    { step: 2, title: 'Identify rising markets', action: 'Find accelerating but immature industries.' },
    { step: 3, title: 'Demand modeling', action: 'Use consumption trends and adoption curves for 3-10 year growth.' },
    { step: 4, title: 'Leaders and tickers', action: 'Identify industry leaders and tradable exposure.' },
    { step: 5, title: 'Progress report', action: 'Describe market development stage and confidence.' },
  ],
  systemPrompt: `You are the Future Opportunist agent. Scan IPOs and emerging markets. Leverage human consumption to estimate growth. Return leaders and stocks.

${SUBAGENT_RULES}
- Flag isIPO and isEmergingMarket in stats for downstream policy gates.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};

export const conservationistAgent: AgentDefinition = {
  id: 'conservationist',
  name: 'Conservationist',
  phase: 'discovery',
  role: 'Low-volatility compounder and defensive growth scout',
  canSpawnSubagents: true,
  commandCategories: [...CONSERVATION_TOOLS],
  plan: [
    { step: 1, title: 'Load user risk posture', action: 'Align with user conservation percentage from prompt.' },
    { step: 2, title: 'Screen durable industries', action: 'Utilities, grid, telecom, essential software, healthcare staples.' },
    { step: 3, title: 'Demand tailwinds', action: 'Validate AI power draw, data centers, connectivity, electrification.' },
    { step: 4, title: 'Quality metrics', action: 'Pull quotes/fundamentals. Prefer consistent revenue and manageable debt.' },
    { step: 5, title: 'Conservative picks', action: 'Return low-risk compounders with conservationScore (0-100).' },
  ],
  systemPrompt: `You are the Conservationist agent. Find long-term low-risk growth (utilities, grid, internet/telecom infra).

${SUBAGENT_RULES}
- Stats: conservationScore (0-100), estimated volatility, regulatory exposure.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};

export const cryptoAnalysisAgent: AgentDefinition = {
  id: 'crypto_analysis',
  name: 'Crypto Analysis',
  phase: 'discovery',
  role: 'Crypto sentiment, protocol, and liquidity analyst',
  canSpawnSubagents: true,
  commandCategories: [...CRYPTO_TOOLS],
  plan: [
    { step: 1, title: 'Macro sentiment', action: 'Gauge investor growth, public outlook, regulatory news.' },
    { step: 2, title: 'Narrative leaders', action: 'Identify leading chains, protocols, rotations.' },
    { step: 3, title: 'Lending and liquidity', action: 'Research hot protocols. Estimate APY, risk, pool size, stability.' },
    { step: 4, title: 'Rank pools', action: 'Rank by APY, risk, size, stability, duration, conservationPercent.' },
    { step: 5, title: 'Deliver findings', action: 'Return protocol/pool findings with evidence. Flag isCrypto in stats.' },
  ],
  systemPrompt: `You are the Crypto Analysis agent. Estimate crypto growth via sentiment. Analyze lending/liquidity pools — rank by APY, risk, size, stability, duration, conservationPercent.

Use CoinGecko tools for crypto prices and market data: coingecko_price for quotes (BTC, ETH, SOL), coingecko_market_chart for history, coingecko_markets for rankings, coingecko_search to resolve coin ids. Do not use stock quote tools for cryptocurrencies.

${SUBAGENT_RULES}
- Stats: apyEstimate, riskScore, poolSizeBand, stability, durationEstimate, conservationPercent, isCrypto: true.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};

export const macroeconomicAgent: AgentDefinition = {
  id: 'macroeconomic',
  name: 'Macroeconomic Research Analyst',
  phase: 'discovery',
  role: 'Global macro and policy impact analyst',
  canSpawnSubagents: true,
  commandCategories: [...MACRO_TOOLS],
  plan: [
    { step: 1, title: 'Interest rates and central banks', action: 'Analyze Fed, ECB, BOJ policy, rate paths, and forward guidance.' },
    { step: 2, title: 'Inflation and employment', action: 'Track CPI, PPI, jobs data narratives, wage pressure, GDP growth.' },
    { step: 3, title: 'Debt and treasuries', action: 'Review treasury yields, credit spreads, sovereign debt dynamics.' },
    { step: 4, title: 'FX and trade', action: 'Assess currency strength, trade balances, tariffs, international trade flows.' },
    { step: 5, title: 'Industry impact', action: 'Assign confidence scores. List industries that benefit or suffer.' },
  ],
  systemPrompt: `You are a Macroeconomic Research Analyst. Analyze current global and domestic economic conditions.

Focus: interest rates, central bank policy, inflation, employment, GDP growth, consumer spending, government policy, debt markets, treasury yields, currency strength, international trade.

Identify trends affecting public companies, industries, commodities, and crypto. Assign confidence scores (0-100). List industries likely to benefit or suffer.

${SUBAGENT_RULES}
- Spawn subagents per domain: rates, inflation, employment, trade.
- Stats: macroConfidence, rateOutlook, inflationTrend, gdpOutlook, beneficiarySectors, harmedSectors.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};

export const earningsIntelligenceAgent: AgentDefinition = {
  id: 'earnings_intelligence',
  name: 'Earnings Intelligence',
  phase: 'discovery',
  role: 'Earnings, fundamentals, and growth trajectory analyst',
  canSpawnSubagents: true,
  commandCategories: [...EARNINGS_TOOLS],
  plan: [
    { step: 1, title: 'Earnings calendar scan', action: 'Find recent and upcoming earnings via news and AV earnings data.' },
    { step: 2, title: 'Financial statements', action: 'Pull income statement, balance sheet, cash flow for key tickers.' },
    { step: 3, title: 'Growth and margins', action: 'Analyze revenue growth, profit margins, debt levels, guidance.' },
    { step: 4, title: 'Analyst expectations', action: 'Assess analyst revisions, EPS surprises, insider transaction news.' },
    { step: 5, title: 'Growth assessment', action: 'Rate future growth potential with evidence and stats.' },
  ],
  systemPrompt: `You are the Earnings Intelligence agent. Analyze public company earnings and financial statements.

Determine revenue growth trends, profit margins, debt levels, analyst expectations, management guidance, EPS surprises, and insider activity. Assess future growth potential.

${SUBAGENT_RULES}
- Use fmp_earnings, fmp_income_statement, fmp_profile, fmp_stock_news (or massive/alphavantage equivalents when FMP is unavailable).
- Stats: revenue_growth, pe_ratio, debt_equity, eps_surprise, margin_trend, guidance_delta.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};

export const technicalAnalysisAgent: AgentDefinition = {
  id: 'technical_analysis',
  name: 'Technical Analysis',
  phase: 'discovery',
  role: 'Price action and technical indicator analyst',
  canSpawnSubagents: true,
  commandCategories: [...TECHNICAL_TOOLS],
  plan: [
    { step: 1, title: 'Identify tickers', action: 'From news and discovery context, select tickers to analyze technically.' },
    { step: 2, title: 'Price structure', action: 'Use daily series for support/resistance levels and trend direction.' },
    { step: 3, title: 'Indicators', action: 'Pull RSI, MACD, Bollinger Bands via technical indicator tools.' },
    { step: 4, title: 'Volume and volatility', action: 'Assess volume trends and price volatility from recent action.' },
    { step: 5, title: 'Technical verdict', action: 'Return bullish/bearish/neutral signal with key levels and stats.' },
  ],
  systemPrompt: `You are the Technical Analysis agent. Large institutions use technical signals — analyze them rigorously.

Responsibilities: support levels, resistance levels, RSI, MACD, volume, volatility.

${SUBAGENT_RULES}
- Use fmp_rsi, fmp_sma, fmp_historical_prices, massive_aggregates (or alphavantage_rsi/macd/bbands/daily_series when unavailable).
- Stats: rsi, macd_signal, support_level, resistance_level, trend, volume_trend, volatility.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};
