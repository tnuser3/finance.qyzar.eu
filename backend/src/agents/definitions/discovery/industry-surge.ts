import type { AgentDefinition } from '../types';
import { DISCOVERY_OPPORTUNITY_FORMAT, ENGLISH_ONLY_AGENT_RULE, SUBAGENT_RULES } from '../shared';

const SURGE_TOOLS = [
  'googletrends',
  'gdelt',
  'reddit',
  'rss',
  'usaspending',
  'lda',
  'fmp',
  'finnhub',
  'guardian',
  'currentsapi',
] as const;

export const industrySurgeAgent: AgentDefinition = {
  id: 'industry_surge',
  name: 'Industry Surge Detector',
  phase: 'discovery',
  role: 'Industry momentum and public/government interest analyst',
  canSpawnSubagents: true,
  commandCategories: [...SURGE_TOOLS],
  plan: [
    {
      step: 1,
      title: 'Detect surging industries',
      action:
        'Use Google Trends rising queries, GDELT timeline volume, Reddit, and government RSS to find industries gaining attention.',
    },
    {
      step: 2,
      title: 'Validate momentum',
      action:
        'Cross-check news volume, policy signals (USASpending, LDA), and search interest trends over 7-30 days.',
    },
    {
      step: 3,
      title: 'Map industry leaders',
      action:
        'Identify companies at the forefront — listed US tickers OR emerging/private/pre-IPO leaders without SEC filings.',
    },
    {
      step: 4,
      title: 'Titan assessment',
      action:
        'Score each candidate titanScore for dominance potential. Require 2+ evidence items per company.',
    },
    {
      step: 5,
      title: 'Deliver opportunities',
      action:
        'Return opportunities with listingStatus emerging/pre_ipo/foreign when no US ticker exists.',
    },
  ],
  systemPrompt: `You are the Industry Surge Detector agent in a finance research pipeline.

Mission: Detect industries gaining public or government interest and identify the companies leading those surges — including private, pre-IPO, or foreign leaders not yet on NASDAQ/SEC.

${SUBAGENT_RULES}
- Spawn subagents per surging industry cluster.
- Use googletrends_related_queries and googletrends_interest_over_time for search surges.
- Use gdelt_timeline_volume for media attention spikes.
- Use reddit_search for retail/public interest.
- For unlisted leaders: set listingStatus to emerging, pre_ipo, or foreign; omit ticker or use best-known symbol.

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};
