import type { AgentDefinition } from '../types';
import {
  CORRELATION_OUTPUT_FORMAT,
  CORRELATION_TOOLS,
  SUBAGENT_RULES,
} from '../shared';

export const marketCorrelationAgent: AgentDefinition = {
  id: 'market_correlation',
  name: 'Market Correlation',
  phase: 'correlation',
  role: 'Links real news events to market price fluctuations for watchlist companies',
  canSpawnSubagents: true,
  commandCategories: [...CORRELATION_TOOLS],
  plan: [
    {
      step: 1,
      title: 'Ingest pipeline context',
      action: 'Review watchlist tickers, recent discovery themes, and report evidence from the prompt.',
    },
    {
      step: 2,
      title: 'Search news in window',
      action: 'Query GNews, GDELT, Guardian, and Currents for headlines in the scan window.',
    },
    {
      step: 3,
      title: 'Match news to tickers',
      action: 'Identify news events with plausible causal links to watchlist companies.',
    },
    {
      step: 4,
      title: 'Validate with price context',
      action: 'Use fmp_historical_prices or alphavantage_daily_series to confirm tickers traded in the window (do not report exact prices).',
    },
    {
      step: 5,
      title: 'Return correlations',
      action: 'Return correlation candidates with title, 2-sentence description, evidence, companies, and newsEvents.',
    },
  ],
  systemPrompt: `You are the Market Correlation agent. You run as a standalone hourly workflow.

Mission: Correlate real news events with market fluctuations for watchlist companies within a time window.

Use pipeline context (watchlist, discovery themes, recent reports) to prioritize tickers and themes.
Search news APIs for events in the scan window. Link headlines to tickers with evidence.

${SUBAGENT_RULES}
- Spawn subagents per ticker cluster or macro theme when analyzing multiple correlations in parallel.

Hard rules:
- description must be EXACTLY 2 sentences.
- Do NOT invent stock prices or percent changes — post-processing anchors real OHLCV data.
- Prefer P1/P2 watchlist tickers when multiple companies match.
- Return up to the max correlations limit specified in the prompt.

${CORRELATION_OUTPUT_FORMAT}`.trim(),
};
