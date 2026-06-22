import type { AgentDefinition } from '../types';
import { DISCOVERY_TOOLS, RISK_OUTPUT_FORMAT, SUBAGENT_RULES } from '../shared';

export const riskPoliticalAgent: AgentDefinition = {
  id: 'risk_political',
  name: 'Political Risk',
  phase: 'risk',
  role: 'Geopolitical and policy risk analyst',
  canSpawnSubagents: true,
  commandCategories: [...DISCOVERY_TOOLS],
  plan: [
    { step: 1, title: 'Ingest discovery', action: 'Review all discovery findings for geopolitical exposure.' },
    { step: 2, title: 'Elections and policy', action: 'Assess election risk, policy shifts, regulatory changes.' },
    { step: 3, title: 'Geopolitics and trade', action: 'Analyze trade wars, sanctions, conflict zones, supply chain politics.' },
    { step: 4, title: 'Company exposure', action: 'Map each company exposure to political risk factors.' },
    { step: 5, title: 'Recommendations', action: 'approve/restrict/reject per company with reasons.' },
  ],
  systemPrompt: `You are the Political Risk agent. Run AFTER discovery.

Analyze: elections, geopolitics, trade wars, sanctions, government policy shifts.

${SUBAGENT_RULES}
${RISK_OUTPUT_FORMAT}

Use news tools extensively.`.trim(),
};

export const riskGovernanceAgent: AgentDefinition = {
  id: 'risk_governance',
  name: 'Corporate Governance',
  phase: 'risk',
  role: 'Corporate governance and leadership risk analyst',
  canSpawnSubagents: true,
  commandCategories: [...DISCOVERY_TOOLS],
  plan: [
    { step: 1, title: 'Leadership review', action: 'Assess CEO behavior, executive turnover, key person risk.' },
    { step: 2, title: 'Board structure', action: 'Review board independence, composition, governance practices.' },
    { step: 3, title: 'Insider activity', action: 'Analyze insider trading patterns and executive transactions.' },
    { step: 4, title: 'Governance red flags', action: 'Flag accounting concerns, related-party deals, weak controls.' },
    { step: 5, title: 'Recommendations', action: 'approve/restrict/reject per company.' },
  ],
  systemPrompt: `You are the Corporate Governance Risk agent. Run AFTER discovery.

Analyze: CEO behavior, executive turnover, board structure, insider trading, governance quality.

${SUBAGENT_RULES}
${RISK_OUTPUT_FORMAT}`.trim(),
};

export const riskFinancialAgent: AgentDefinition = {
  id: 'risk_financial',
  name: 'Financial Risk',
  phase: 'risk',
  role: 'Balance sheet and solvency risk analyst',
  canSpawnSubagents: true,
  commandCategories: [...DISCOVERY_TOOLS],
  plan: [
    { step: 1, title: 'Debt analysis', action: 'Review debt levels, maturity walls, covenant risk, credit ratings.' },
    { step: 2, title: 'Cash and liquidity', action: 'Assess cash reserves, working capital, liquidity runway.' },
    { step: 3, title: 'Burn rate', action: 'For growth companies, estimate cash burn and funding needs.' },
    { step: 4, title: 'Bankruptcy risk', action: 'Flag distress signals, going-concern risks, restructuring news.' },
    { step: 5, title: 'Recommendations', action: 'approve/restrict/reject with financial risk reasons.' },
  ],
  systemPrompt: `You are the Financial Risk agent. Run AFTER discovery.

Analyze: debt, cash reserves, bankruptcy risk, burn rate, liquidity.

Use fmp income statement, balance sheet, earnings, profile tools (or massive/alphavantage equivalents when FMP is unavailable).

${SUBAGENT_RULES}
${RISK_OUTPUT_FORMAT}`.trim(),
};

export const riskMarketAgent: AgentDefinition = {
  id: 'risk_market',
  name: 'Market Risk',
  phase: 'risk',
  role: 'Market volatility and liquidity risk analyst',
  canSpawnSubagents: true,
  commandCategories: [...DISCOVERY_TOOLS],
  plan: [
    { step: 1, title: 'Volatility map', action: 'Build volatility map by industry and asset from discovery data.' },
    { step: 2, title: 'Liquidity check', action: 'Assess trading volume, bid-ask, market cap adequacy.' },
    { step: 3, title: 'Correlation and drawdown', action: 'Estimate correlation risk and drawdown potential.' },
    { step: 4, title: 'Maturity test', action: 'Flag immature or hype-driven markets vs user risk_percentage.' },
    { step: 5, title: 'Recommendations', action: 'Safety nets, restrictions, per-company approve/restrict/reject.' },
  ],
  systemPrompt: `You are the Market Risk agent. Run AFTER discovery.

Analyze: volatility, liquidity, correlation, drawdown potential. Compare against user maxVolatility and risk_percentage.

${SUBAGENT_RULES}
${RISK_OUTPUT_FORMAT}

Use price data and technical tools when tickers exist.`.trim(),
};

export const riskReputationAgent: AgentDefinition = {
  id: 'risk_reputation',
  name: 'Reputation Risk',
  phase: 'risk',
  role: 'Reputation, PR, and litigation risk analyst',
  canSpawnSubagents: true,
  commandCategories: [...DISCOVERY_TOOLS],
  plan: [
    { step: 1, title: 'Scandal scan', action: 'Search for public scandals, fraud allegations, ethical breaches.' },
    { step: 2, title: 'PR disasters', action: 'Review PR crises, brand damage, customer backlash.' },
    { step: 3, title: 'Labor disputes', action: 'Assess strikes, union conflicts, workplace culture issues.' },
    { step: 4, title: 'Litigation', action: 'Review active lawsuits, regulatory actions, settlements.' },
    { step: 5, title: 'Social-political opinion', action: 'Summarize each company social-political state. approve/restrict/reject.' },
  ],
  systemPrompt: `You are the Reputation Risk agent. Run AFTER discovery.

Analyze: public scandals, PR disasters, labor disputes, litigation. Return social-political state opinion per company.

${SUBAGENT_RULES}
${RISK_OUTPUT_FORMAT}

Include socialPoliticalState: stable|mixed|concerning|toxic in assessments.`.trim(),
};
