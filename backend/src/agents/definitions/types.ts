export type AgentPhase = 'discovery' | 'risk' | 'decision' | 'format' | 'monitoring' | 'correlation';

export type AgentId =
  | 'commodities'
  | 'future_opportunist'
  | 'conservationist'
  | 'crypto_analysis'
  | 'macroeconomic'
  | 'earnings_intelligence'
  | 'technical_analysis'
  | 'regulatory_discovery'
  | 'risk_political'
  | 'risk_governance'
  | 'risk_financial'
  | 'risk_market'
  | 'risk_reputation'
  | 'master_investment_committee'
  | 'formatter'
  | 'evidence_widgets'
  | 'market_correlation'
  | 'watchlist_reviewer'
  | 'monitor_regulatory'
  | 'monitor_news'
  | 'monitor_sentiment'
  | 'monitor_market';

export type Recommendation = 'BUY' | 'HOLD' | 'SELL' | 'AVOID';

export type TimeHorizon = '1M' | '3M' | '6M' | '1Y' | '5Y';

export interface AgentPlanStep {
  step: number;
  title: string;
  action: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  phase: AgentPhase;
  role: string;
  systemPrompt: string;
  plan: AgentPlanStep[];
  commandCategories: string[];
  canSpawnSubagents: boolean;
}

export interface SubagentTask {
  label: string;
  prompt: string;
}

export interface EvidenceItem {
  agent: string;
  finding: string;
}

export type WidgetType =
  | 'line_chart'
  | 'bar_chart'
  | 'timeline'
  | 'list'
  | 'metric_grid'
  | 'progress'
  | 'comparison'
  | 'sparkline'
  | 'donut'
  | 'table'
  | 'correlation_chart';

export interface WidgetSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface WidgetTimelineEvent {
  at: string;
  title: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high';
  source?: string;
}

export interface WidgetListItem {
  label: string;
  value?: string;
  detail?: string;
}

export interface WidgetMetric {
  label: string;
  value: string | number;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  unit?: string;
}

export interface WidgetProgressItem {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

export interface EvidenceWidget {
  id: string;
  type: WidgetType;
  title: string;
  subtitle?: string;
  source?: string;
  priority?: number;
  data: Record<string, unknown>;
}

export interface InvestmentReport {
  company: string;
  ticker: string;
  industry: string;
  recommendation: Recommendation;
  confidence: number;
  risk_score: number;
  agents: string[];
  evidence: EvidenceItem[];
  statistics: Record<string, unknown>;
  widgets?: EvidenceWidget[];
  time_horizon: string;
  generated_at: string;
  approved?: boolean;
  restriction_reason?: string;
}

export interface RiskAssessment {
  agent: string;
  summary: string;
  safetyNets: string[];
  restrictions: string[];
  companyAssessments: Array<{
    company: string;
    ticker?: string;
    risk_score?: number;
    profitable?: boolean;
    socialPoliticalState?: string;
    volatility?: string;
    recommendation: 'approve' | 'restrict' | 'reject';
    reasons: string[];
  }>;
}

export interface PipelineRunResult {
  ok: boolean;
  runId: string;
  accountId: string;
  discovery: Record<string, unknown>;
  risk: Record<string, unknown>;
  decision: Record<string, unknown>;
  report: InvestmentReport[];
  savedCount: number;
}

export interface MonitoringSignal {
  company: string;
  ticker: string;
  risk_score?: number;
  sentiment_score?: number;
  growth_score?: number;
  severity?: 'low' | 'medium' | 'high';
  signals?: Array<{ source: string; finding: string }>;
}

export type ListingStatus = 'listed' | 'emerging' | 'pre_ipo' | 'foreign';

export interface DiscoveryOpportunityEvidence {
  source: string;
  rawData: string;
  reason: string;
  summary: string;
}

export interface DiscoveryOpportunity {
  title: string;
  description: string;
  ticker?: string;
  company: string;
  industry: string;
  listingStatus: ListingStatus;
  confidence: number;
  risk_score: number;
  titanScore: number;
  evidence: DiscoveryOpportunityEvidence[];
  discoveredBy?: string[];
  agentId?: string;
}

export interface NormalizedOpportunity extends DiscoveryOpportunity {
  key: string;
  discoveredBy: string[];
}

export interface PhaseAgentResult {
  agentId: string;
  opportunities: NormalizedOpportunity[];
  summary: string;
  shortfallNote?: string;
  failed: boolean;
  failureReason?: string;
}

export interface ValidationAssessment {
  agentId: string;
  ticker?: string;
  company: string;
  risk_score: number;
  profitable: boolean;
  recommendation: 'approve' | 'restrict' | 'reject';
  reasons: string[];
}

export interface DiscoveryPhaseContext {
  phase1: PhaseAgentResult[];
  phase2: PhaseAgentResult[];
  candidates: NormalizedOpportunity[];
  validation: ValidationAssessment[];
  reboundAttempt: number;
  rejectionFeedback?: string;
}

export interface DiscoveryAgentResearch {
  agentId: string;
  phase?: 'collection' | 'abstraction' | 'validation';
  task: string;
  failed: boolean;
  failureReason?: string;
  seedTools: number;
  modelTools: number;
  seedEvidence: string;
  seedResults: Array<{
    name: string;
    ok: boolean;
    error?: string;
    rateLimited?: boolean;
    result?: unknown;
  }>;
  summary?: string;
  opportunities?: DiscoveryOpportunity[];
  companies: Array<{ ticker: string; name: string; industry: string; confidence: number }>;
  newOpportunities: string[];
  findings: AgentFinding[];
  reports: InvestmentReport[];
  agentOutput: string;
  rawText: string;
}

export interface DiscoveryCompanyDossier {
  ticker: string;
  name: string;
  industry: string;
  confidence: number;
  recommendation: string;
  title?: string;
  listingStatus?: ListingStatus;
  titanScore?: number;
  riskScore?: number;
  discoveredBy: string[];
  summary: string;
  whyAdded: string;
  risk: string;
  opportunity: string;
  industryContext: string;
  rivals: string;
  geopolitics: string;
  stockSnapshot: {
    exchange?: string;
    price?: number;
    marketCap?: number;
    currency?: string;
  };
  evidence: Array<{
    source: string;
    kind: string;
    detail: string;
    url?: string;
    rawData?: string;
    reason?: string;
  }>;
  synthesized: boolean;
  rejected?: boolean;
  rejectReason?: string;
}

export interface DiscoveryWorkflowResult {
  ok: boolean;
  runId: string;
  newOpportunities: string[];
  companiesAdded: number;
  companies: Array<{ ticker: string; name: string; industry: string; confidence: number }>;
  reportsSaved?: number;
  error?: string;
  agents?: DiscoveryAgentResearch[];
  dossiers?: DiscoveryCompanyDossier[];
  rejectedCandidates?: DiscoveryCompanyDossier[];
  phaseContext?: DiscoveryPhaseContext;
  reboundCount?: number;
  shortfallExplanation?: string;
  durationMs?: number;
}

export interface MonitoringWorkflowResult {
  ok: boolean;
  runId: string;
  priority: 1 | 2 | 3;
  companiesScanned: number;
  reportsSaved: number;
  snapshotsSaved: number;
}

export interface EventWorkflowResult {
  ok: boolean;
  runId: string;
  eventId: string;
  companyId: string;
  ticker: string;
}

export interface MarketCorrelationCandidate {
  title: string;
  description: string;
  windowStart: string;
  windowEnd: string;
  primaryTicker: string;
  companies: Array<{ ticker: string; name: string }>;
  evidence: EvidenceItem[];
  newsEvents: Array<{ at: string; title: string; source: string; url?: string }>;
  confidence?: number;
}

export interface MarketCorrelationRecord {
  id: string;
  runId: string;
  title: string;
  description: string;
  windowStart: string;
  windowEnd: string;
  primaryTicker: string;
  companies: Array<{ ticker: string; name: string }>;
  evidence: EvidenceItem[];
  newsEvents: Array<{ at: string; title: string; source: string; url?: string }>;
  priceMove: {
    ticker: string;
    priceAtStart: number;
    priceAtEnd: number;
    pctChange: number;
    startAt: string;
    endAt: string;
  };
  widgets: EvidenceWidget[];
  confidence: number;
  createdAt: string;
}

export interface MarketCorrelationWorkflowResult {
  ok: boolean;
  runId: string;
  windowStart: string;
  windowEnd: string;
  correlationsFound: number;
  correlationsSaved: number;
  correlations: MarketCorrelationRecord[];
}

export interface WatchlistReviewCandidate {
  ticker: string;
  name: string;
  headline: string;
  summary: string;
  sentiment: string;
  confidence: number;
  newsHighlights: Array<{ at: string; title: string; source: string; url?: string }>;
  evidence: EvidenceItem[];
}

export interface WatchlistReviewRecord extends WatchlistReviewCandidate {
  companyId: string;
  tradingDay: string;
  windowStart: string;
  windowEnd: string;
  runId: string;
}

export interface WatchlistReviewerWorkflowResult {
  ok: boolean;
  runId: string;
  tradingDay: string;
  windowStart: string;
  windowEnd: string;
  companiesReviewed: number;
  reviewsSaved: number;
  correlationsFound: number;
  correlationsSaved: number;
  reviews: WatchlistReviewRecord[];
  correlations: MarketCorrelationRecord[];
  message?: string;
}

export type TimelineEventType =
  | 'correlation'
  | 'news'
  | 'price_move'
  | 'price_point'
  | 'monitoring_snapshot';

export interface TimelineEvent {
  id: string;
  occurredAt: string;
  eventType: TimelineEventType;
  ticker: string | null;
  title: string;
  description: string | null;
  correlationId: string | null;
  runId: string | null;
  companies: Array<{ ticker: string; name: string }>;
  evidence: EvidenceItem[];
  widgets: EvidenceWidget[];
  payload: Record<string, unknown>;
  createdAt: string;
}


export interface AgentFinding {
  company: string;
  type: string;
  agent: string;
  industry: string;
  title: string;
  description: string;
  evidence: unknown[];
  stats: Record<string, unknown>;
  riskFlags?: string[];
  approved?: boolean;
  restrictionReason?: string;
}
