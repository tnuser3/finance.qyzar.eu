import type { AgentDefinition } from './types';

export * from './types';
export * from './shared';

import {
  commoditiesAgent,
  conservationistAgent,
  cryptoAnalysisAgent,
  earningsIntelligenceAgent,
  futureOpportunistAgent,
  macroeconomicAgent,
  technicalAnalysisAgent,
} from './discovery/index';

import { industrySurgeAgent } from './discovery/industry-surge';

import { regulatoryDiscoveryAgent } from './discovery/regulatory';

import {
  riskFinancialAgent,
  riskGovernanceAgent,
  riskMarketAgent,
  riskPoliticalAgent,
  riskReputationAgent,
} from './risk/index';

import { monitoringAgents } from './monitoring/index';
import { watchlistReviewerAgent } from './monitoring/watchlist-reviewer';
import { masterInvestmentCommitteeAgent } from './decision/mic';
import { formatterAgent } from './format/formatter';
import { evidenceWidgetsAgent } from './format/evidence-widgets';
import { marketCorrelationAgent } from './correlation/market-correlation';

export const agentDefinitions: AgentDefinition[] = [
  commoditiesAgent,
  futureOpportunistAgent,
  conservationistAgent,
  cryptoAnalysisAgent,
  macroeconomicAgent,
  industrySurgeAgent,
  earningsIntelligenceAgent,
  technicalAnalysisAgent,
  regulatoryDiscoveryAgent,
  riskPoliticalAgent,
  riskGovernanceAgent,
  riskFinancialAgent,
  riskMarketAgent,
  riskReputationAgent,
  masterInvestmentCommitteeAgent,
  formatterAgent,
  evidenceWidgetsAgent,
  marketCorrelationAgent,
  watchlistReviewerAgent,
  ...monitoringAgents,
];

export const discoveryAgents = agentDefinitions.filter(
  (agent) => agent.phase === 'discovery'
);

export const PHASE1_AGENT_IDS = ['commodities', 'crypto_analysis', 'macroeconomic'] as const;
export const PHASE2_AGENT_IDS = ['future_opportunist', 'conservationist', 'industry_surge'] as const;
export const PHASE3_AGENT_IDS = [
  'regulatory_discovery',
  'risk_political',
  'risk_governance',
  'risk_financial',
  'risk_market',
  'risk_reputation',
] as const;

export const dailyDiscoveryAgents = agentDefinitions.filter((agent) =>
  [...PHASE1_AGENT_IDS, ...PHASE2_AGENT_IDS, ...PHASE3_AGENT_IDS].includes(agent.id)
);

export const riskAgents = agentDefinitions.filter((agent) => agent.phase === 'risk');

export const decisionAgents = agentDefinitions.filter(
  (agent) => agent.phase === 'decision'
);

export { monitoringAgents, evidenceWidgetsAgent, marketCorrelationAgent, watchlistReviewerAgent, formatterAgent };

export function getAgent(id: string): AgentDefinition | undefined {
  return agentDefinitions.find((agent) => agent.id === id);
}
