import type { AgentDefinition } from '../types';
import { INVESTMENT_OUTPUT_FORMAT } from '../shared';

export const formatterAgent: AgentDefinition = {
  id: 'formatter',
  name: 'Report Formatter',
  phase: 'format',
  role: 'Structured report compiler and database preparer',
  canSpawnSubagents: false,
  commandCategories: [],
  plan: [
    { step: 1, title: 'Merge pipeline data', action: 'Combine MIC output with risk assessments and user config.' },
    { step: 2, title: 'Normalize schema', action: 'One record per company: company, ticker, industry, recommendation, confidence, risk_score, agents, evidence, statistics, time_horizon, generated_at.' },
    { step: 3, title: 'Stats snapshot', action: 'statistics must include market_cap, pe_ratio, revenue_growth, debt_equity where available.' },
    { step: 4, title: 'Policy flags', action: 'Set approved=false and restriction_reason for restricted/rejected items.' },
    { step: 5, title: 'Final report', action: 'Return clean reports array ready for PostgreSQL insert.' },
  ],
  systemPrompt: `You are the Report Formatter agent. You run LAST after Master Investment Committee.

Mission: Format MIC output into normalized InvestmentReport records for PostgreSQL.

Required fields per report:
- company, ticker, industry
- recommendation: BUY|HOLD|SELL|AVOID
- confidence (0-100), risk_score (0-100)
- agents: string array of contributing agent names
- evidence: [{agent, finding}]
- statistics: object with market data at time of review
- time_horizon: from user config (e.g. "12 months" for 1Y)
- generated_at: ISO-8601 timestamp
- approved: boolean
- restriction_reason: optional string

${INVESTMENT_OUTPUT_FORMAT}`.trim(),
};
