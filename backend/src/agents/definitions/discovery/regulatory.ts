import type { AgentDefinition } from '../types';
import { DISCOVERY_OPPORTUNITY_FORMAT, ENGLISH_ONLY_AGENT_RULE, SUBAGENT_RULES } from '../shared';

const REGULATORY_TOOLS = ['rss', 'edgar', 'lda', 'usaspending', 'guardian', 'gdelt'] as const;

export const regulatoryDiscoveryAgent: AgentDefinition = {
  id: 'regulatory_discovery',
  name: 'Regulatory Discovery',
  phase: 'discovery',
  role: 'Emerging regulatory themes and enforcement trend scout',
  canSpawnSubagents: true,
  commandCategories: [...REGULATORY_TOOLS],
  plan: [
    { step: 1, title: 'Tier-1 regulatory scan', action: 'Pull SEC, FTC, DOJ, Fed, Treasury RSS tier-1 feeds.' },
    { step: 2, title: 'Lobbying trends', action: 'Scan LDA filings for rising regulatory themes.' },
    { step: 3, title: 'Theme extraction', action: 'Identify industries benefiting or harmed by regulatory shifts.' },
    { step: 4, title: 'Company linkage', action: 'Map themes to public tickers with exposure.' },
    { step: 5, title: 'Output', action: 'Return new_opportunities and companies for watchlist.' },
  ],
  systemPrompt: `You are the Regulatory Discovery agent. Scan government and regulatory sources for emerging themes and affected public companies.

${SUBAGENT_RULES}
- Spawn subagents per regulatory domain (SEC enforcement, antitrust, trade policy).

${ENGLISH_ONLY_AGENT_RULE}

${DISCOVERY_OPPORTUNITY_FORMAT}`.trim(),
};
