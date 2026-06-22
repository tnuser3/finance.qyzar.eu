import {
  getAgent,
  PHASE1_AGENT_IDS,
  PHASE2_AGENT_IDS,
  PHASE3_AGENT_IDS,
} from '../definitions';
import type {
  AgentDefinition,
  DiscoveryAgentResearch,
  DiscoveryOpportunity,
  DiscoveryPhaseContext,
  NormalizedOpportunity,
  PhaseAgentResult,
  ValidationAssessment,
} from '../definitions/types';
import type { DiscoveryBootstrapResult } from './bootstrap';
import { callDeepAI } from '../../providers/ai/deepai';
import {
  extractDiscoveryOpportunities,
  extractInvestmentReports,
  extractRiskAssessment,
} from '../runtime/parser';
import { runSpecializedAgent, type SpecializedAgentResult } from '../runtime/subagent';
import { applyValidationScores, withComputedScores } from './helpers';
import { filterEnglishOpportunities } from './helpers';
import { logError } from '../../infra/db/error-log';
import {
  resolveAgentModel,
  SHORTFALL_EXPLANATION_MODEL,
} from '../runtime/types';

const MIN_COMPANIES = Number(process.env.DISCOVERY_MIN_COMPANIES) || 5;
const MAX_REBOUNDS = Number(process.env.DISCOVERY_MAX_REBOUNDS) || 3;
const RISK_REJECT_THRESHOLD = 80;

const PHASE_TASKS: Record<string, string> = {
  commodities:
    'Phase 1 collection: Review commodity supply chains (energy, metals, ag, semiconductors). Return at least 2 titan-caliber public companies with full evidence.',
  crypto_analysis:
    'Phase 1 collection: Analyze crypto market leaders and related public equities. Return at least 2 opportunities with evidence.',
  macroeconomic:
    'Phase 1 collection: Analyze macro conditions (rates, inflation, employment, trade). Return at least 2 representative public companies in beneficiary sectors.',
  future_opportunist:
    'Phase 2 abstraction: Scan IPOs, listings, SPACs, high-growth sectors. Build on Phase 1 signals. Return at least 2 titan opportunities.',
  conservationist:
    'Phase 2 abstraction: Find durable compounders (utilities, grid, telecom, staples). Build on Phase 1. Return at least 2 low-risk titan candidates.',
  industry_surge:
    'Phase 2 abstraction: Detect surging industries and map to forefront companies (listed or emerging). Return at least 2 opportunities.',
  regulatory_discovery:
    'Phase 3 validation: Review candidates for regulatory/compliance risk. Flag severe blockers. Return validation assessments in opportunities format where applicable.',
};

function slugify(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12);
}

export function opportunityKey(opp: DiscoveryOpportunity): string {
  if (opp.ticker?.trim()) return opp.ticker.trim().toUpperCase();
  return `NAME:${slugify(opp.company)}`;
}

export function normalizeOpportunities(
  opportunities: DiscoveryOpportunity[],
  agentId: string
): NormalizedOpportunity[] {
  return opportunities.map((opp) =>
    withComputedScores({
      ...opp,
      key: opportunityKey(opp),
      discoveredBy: [...new Set([...(opp.discoveredBy ?? []), agentId])],
      agentId,
    })
  );
}

function mergeCandidates(existing: NormalizedOpportunity[], incoming: NormalizedOpportunity[]): NormalizedOpportunity[] {
  const map = new Map<string, NormalizedOpportunity>();

  for (const opp of [...existing, ...incoming]) {
    const prev = map.get(opp.key);
    if (!prev) {
      map.set(opp.key, withComputedScores(opp));
      continue;
    }

    map.set(opp.key, withComputedScores({
      ...prev,
      ...opp,
      discoveredBy: [...new Set([...prev.discoveredBy, ...opp.discoveredBy])],
      evidence: [...prev.evidence, ...opp.evidence].slice(0, 12),
      description: opp.description.length > prev.description.length ? opp.description : prev.description,
    }));
  }

  return [...map.values()].sort((a, b) => b.titanScore - a.titanScore);
}

function summarizePhaseContext(context: DiscoveryPhaseContext, maxChars = 12_000): string {
  const payload = {
    phase1: context.phase1.map((p) => ({
      agentId: p.agentId,
      summary: p.summary,
      opportunities: p.opportunities.map((o) => ({
        title: o.title,
        company: o.company,
        ticker: o.ticker,
        industry: o.industry,
        titanScore: o.titanScore,
        listingStatus: o.listingStatus,
      })),
    })),
    phase2: context.phase2.map((p) => ({
      agentId: p.agentId,
      summary: p.summary,
      opportunities: p.opportunities.map((o) => ({
        title: o.title,
        company: o.company,
        ticker: o.ticker,
        industry: o.industry,
        titanScore: o.titanScore,
        listingStatus: o.listingStatus,
      })),
    })),
    candidates: context.candidates.map((c) => ({
      key: c.key,
      title: c.title,
      company: c.company,
      ticker: c.ticker,
      industry: c.industry,
      titanScore: c.titanScore,
      confidence: c.confidence,
      risk_score: c.risk_score,
      listingStatus: c.listingStatus,
      description: c.description.slice(0, 400),
      evidenceCount: c.evidence.length,
    })),
    reboundAttempt: context.reboundAttempt,
    rejectionFeedback: context.rejectionFeedback,
  };

  let text = JSON.stringify(payload, null, 2);
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n...[truncated]`;
  }
  return text;
}

export function buildPhasePrompt(
  agentId: string,
  baseTask: string,
  context: DiscoveryPhaseContext | null,
  phase: 'collection' | 'abstraction' | 'validation' | 'topup'
): string {
  const task = PHASE_TASKS[agentId] ?? baseTask;
  const parts = [task];

  if (context && phase !== 'collection') {
    parts.push(`\nPrior phase context:\n${summarizePhaseContext(context)}`);
  }

  if (phase === 'abstraction') {
    parts.push(
      '\nBuild on Phase 1 signals. Do not duplicate candidates without new evidence. Target titan-caliber industry leaders.'
    );
  }

  if (phase === 'validation') {
    parts.push(
      '\nValidate each candidate for profitability and risk. Reject weak theses. Risk agents: assess every candidate with risk_score 0-100 and recommendation approve|restrict|reject.'
    );
  }

  if (phase === 'topup') {
    const need = Math.max(0, MIN_COMPANIES - context!.candidates.length);
    parts.push(
      `\nTOP-UP PASS: Need ${need} additional titan-caliber candidates to reach minimum ${MIN_COMPANIES}. Prior rejections:\n${context!.rejectionFeedback ?? 'none'}`
    );
  }

  if (context?.rejectionFeedback && phase === 'abstraction') {
    parts.push(`\nRebound feedback (avoid these patterns, find replacements):\n${context.rejectionFeedback}`);
  }

  return parts.join('\n');
}

function extractAgentOutputBlock(text: string): string {
  return text.match(/<agent_output>[\s\S]*?<\/agent_output>/i)?.[0] ?? '';
}

function toPhaseResult(
  agentId: string,
  result: SpecializedAgentResult
): PhaseAgentResult {
  const parsed = extractDiscoveryOpportunities(result.text, agentId);
  return {
    agentId,
    opportunities: normalizeOpportunities(
      filterEnglishOpportunities(parsed.opportunities),
      agentId
    ),
    summary: parsed.summary,
    shortfallNote: parsed.shortfallNote,
    failed: result.failed === true,
    failureReason: result.failureReason,
  };
}

function buildAgentResearch(
  definition: AgentDefinition,
  result: SpecializedAgentResult,
  bootstrap: DiscoveryBootstrapResult,
  phase: 'collection' | 'abstraction' | 'validation',
  task: string
): DiscoveryAgentResearch {
  const parsed = extractDiscoveryOpportunities(result.text, definition.id);
  const legacy = parsed.opportunities
    .filter((o) => o.ticker)
    .map((o) => ({
      ticker: o.ticker!,
      name: o.company,
      industry: o.industry,
      confidence: o.confidence,
    }));

  return {
    agentId: definition.id,
    phase,
    task,
    failed: result.failed === true,
    failureReason: result.failureReason,
    seedTools: bootstrap.seedToolCalls,
    modelTools: result.modelToolCalls ?? 0,
    seedEvidence: bootstrap.evidenceSummary,
    seedResults: bootstrap.results.map((entry) => ({
      name: entry.name,
      ok: entry.ok,
      error: entry.error,
      rateLimited: entry.rateLimited,
      result: entry.ok ? entry.result : undefined,
    })),
    summary: parsed.summary,
    opportunities: parsed.opportunities,
    companies: legacy,
    newOpportunities: [...new Set(parsed.opportunities.map((o) => o.industry))],
    findings: result.findings,
    reports: [...result.reports, ...extractInvestmentReports(result.text)],
    agentOutput: extractAgentOutputBlock(result.text),
    rawText: result.text,
  };
}

async function runAgentBatch(options: {
  agentIds: readonly string[];
  phase: 'collection' | 'abstraction' | 'validation';
  defaultModel: string;
  context: string;
  phaseContext: DiscoveryPhaseContext | null;
  bootstraps: Map<string, DiscoveryBootstrapResult>;
  promptPhase: 'collection' | 'abstraction' | 'validation' | 'topup';
  onEvent?: (event: Record<string, unknown>) => void;
}): Promise<{
  results: SpecializedAgentResult[];
  phaseResults: PhaseAgentResult[];
  research: DiscoveryAgentResearch[];
}> {
  const definitions = options.agentIds
    .map((id) => getAgent(id))
    .filter((d): d is AgentDefinition => d != null);

  const settled = await Promise.allSettled(
    definitions.map(async (definition) => {
      const bootstrap = options.bootstraps.get(definition.id) ?? {
        evidenceSummary: '',
        seedToolCalls: 0,
        results: [],
      };

      const task = buildPhasePrompt(
        definition.id,
        PHASE_TASKS[definition.id] ?? definition.role,
        options.phaseContext,
        options.promptPhase
      );

      const agentModel = resolveAgentModel(definition.id, options.defaultModel);

      options.onEvent?.({
        type: 'agent_start',
        agentId: definition.id,
        phase: options.phase,
        model: agentModel,
      });

      return runSpecializedAgent({
        definition,
        prompt: task,
        model: agentModel,
        context: options.context,
        onEvent: options.onEvent,
        seedEvidence: bootstrap.evidenceSummary,
        seedToolCalls: bootstrap.seedToolCalls,
      });
    })
  );

  const results: SpecializedAgentResult[] = [];
  const phaseResults: PhaseAgentResult[] = [];
  const research: DiscoveryAgentResearch[] = [];

  settled.forEach((outcome, index) => {
    const definition = definitions[index]!;
    const bootstrap = options.bootstraps.get(definition.id) ?? {
      evidenceSummary: '',
      seedToolCalls: 0,
      results: [],
    };

    if (outcome.status === 'rejected') {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : 'agent failed';
      const failedResult: SpecializedAgentResult = {
        agentId: definition.id,
        text: '',
        findings: [],
        reports: [],
        risk: null,
        subagentResults: [],
        failed: true,
        failureReason: message,
        seedToolCalls: bootstrap.seedToolCalls,
        modelToolCalls: 0,
      };
      results.push(failedResult);
      phaseResults.push(toPhaseResult(definition.id, failedResult));
      research.push(
        buildAgentResearch(definition, failedResult, bootstrap, options.phase, PHASE_TASKS[definition.id] ?? '')
      );
      return;
    }

    results.push(outcome.value);
    phaseResults.push(toPhaseResult(definition.id, outcome.value));
    research.push(
      buildAgentResearch(
        definition,
        outcome.value,
        bootstrap,
        options.phase,
        buildPhasePrompt(definition.id, PHASE_TASKS[definition.id] ?? '', options.phaseContext, options.promptPhase)
      )
    );
  });

  return { results, phaseResults, research };
}

function collectValidationAssessments(
  results: SpecializedAgentResult[],
  agentIds: readonly string[]
): ValidationAssessment[] {
  const assessments: ValidationAssessment[] = [];

  results.forEach((result, index) => {
    const agentId = agentIds[index] ?? result.agentId;
    const risk = extractRiskAssessment(result.text, agentId);

    if (risk?.companyAssessments?.length) {
      for (const row of risk.companyAssessments) {
        assessments.push({
          agentId,
          ticker: row.ticker,
          company: row.company,
          risk_score: Math.min(100, Math.max(0, Number(row.risk_score ?? 50))),
          profitable: row.profitable !== false,
          recommendation: row.recommendation,
          reasons: row.reasons ?? [],
        });
      }
      return;
    }

    const parsed = extractDiscoveryOpportunities(result.text, agentId);
    for (const opp of parsed.opportunities) {
      assessments.push({
        agentId,
        ticker: opp.ticker,
        company: opp.company,
        risk_score: opp.risk_score,
        profitable: opp.risk_score <= RISK_REJECT_THRESHOLD,
        recommendation: opp.risk_score > RISK_REJECT_THRESHOLD ? 'reject' : 'approve',
        reasons: [opp.description.slice(0, 200)],
      });
    }
  });

  return assessments;
}

function matchAssessmentToCandidate(
  assessment: ValidationAssessment,
  candidate: NormalizedOpportunity
): boolean {
  const ticker = assessment.ticker?.trim().toUpperCase();
  if (ticker && candidate.ticker?.toUpperCase() === ticker) return true;
  if (assessment.company.toLowerCase() === candidate.company.toLowerCase()) return true;
  return candidate.key.includes(slugify(assessment.company));
}

export function validateCandidates(
  candidates: NormalizedOpportunity[],
  assessments: ValidationAssessment[]
): {
  accepted: NormalizedOpportunity[];
  rejected: Array<{ candidate: NormalizedOpportunity; reasons: string[] }>;
} {
  const accepted: NormalizedOpportunity[] = [];
  const rejected: Array<{ candidate: NormalizedOpportunity; reasons: string[] }> = [];

  for (const candidate of candidates) {
    const matched = assessments.filter((a) => matchAssessmentToCandidate(a, candidate));
    const reasons: string[] = [];

    let reject = false;

    for (const row of matched) {
      if (row.recommendation === 'reject') {
        reject = true;
        reasons.push(`${row.agentId}: reject — ${row.reasons.join('; ')}`);
      }
      if (row.risk_score > RISK_REJECT_THRESHOLD) {
        reject = true;
        reasons.push(`${row.agentId}: risk_score ${row.risk_score} > ${RISK_REJECT_THRESHOLD}`);
      }
      if (row.profitable === false) {
        reject = true;
        reasons.push(`${row.agentId}: marked not profitable`);
      }
    }

    if (matched.length === 0) {
      if (candidate.risk_score > RISK_REJECT_THRESHOLD) {
        reject = true;
        reasons.push(`discovery risk_score ${candidate.risk_score} > ${RISK_REJECT_THRESHOLD}`);
      }
    }

    if (reject) {
      rejected.push({ candidate, reasons });
    } else {
      accepted.push(applyValidationScores(candidate, matched));
    }
  }

  return { accepted, rejected };
}

function buildRejectionFeedback(
  rejected: Array<{ candidate: NormalizedOpportunity; reasons: string[] }>
): string {
  if (rejected.length === 0) return '';

  return rejected
    .map(
      (row) =>
        `- ${row.candidate.company} (${row.candidate.ticker ?? row.candidate.listingStatus}): ${row.reasons.join(' | ')}`
    )
    .join('\n');
}

async function explainShortfall(options: {
  accepted: NormalizedOpportunity[];
  rejectedCount: number;
  reboundCount: number;
  agentFailures: Array<{ agentId: string; reason?: string }>;
  phase1Count: number;
  phase2Count: number;
}): Promise<string> {
  const failureSummary = options.agentFailures
    .map((a) => `${a.agentId} (${a.reason ?? 'failed'})`)
    .join(', ');

  const prompt = `Discovery run completed with ${options.accepted.length} accepted companies (target ${MIN_COMPANIES}).
Phase 1 opportunities: ${options.phase1Count}. Phase 2 opportunities: ${options.phase2Count}.
Rebounds: ${options.reboundCount}. Validation rejections: ${options.rejectedCount}.
Agent failures: ${failureSummary || 'none'}.

Explain specifically why the minimum was not met — cite likely causes: model not returning JSON, weak/noisy seed news, strict risk gates, missing API keys (Reddit/Trends), or GDELT rate limits. Be direct and actionable in 3-5 sentences.`;

  try {
    return await callDeepAI({
      model: SHORTFALL_EXPLANATION_MODEL,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (error) {
      logError(error, { source: 'agents/discovery-phases.ts - explainShortfall' });
    return `Only ${options.accepted.length} of ${MIN_COMPANIES} target companies passed validation after ${options.reboundCount} rebound(s). Consider stronger model, more API sources, or relaxed risk thresholds.`;
  }
}

export interface PhasedDiscoveryResult {
  phaseContext: DiscoveryPhaseContext;
  accepted: NormalizedOpportunity[];
  rejected: Array<{ candidate: NormalizedOpportunity; reasons: string[] }>;
  allResearch: DiscoveryAgentResearch[];
  allReports: ReturnType<typeof extractInvestmentReports>;
  reboundCount: number;
  shortfallExplanation?: string;
}

export async function runPhasedDiscovery(options: {
  defaultModel?: string;
  context: string;
  bootstraps: Map<string, DiscoveryBootstrapResult>;
  onEvent?: (event: Record<string, unknown>) => void;
}): Promise<PhasedDiscoveryResult> {
  const defaultModel = options.defaultModel?.trim() || resolveAgentModel('commodities');
  const phaseContext: DiscoveryPhaseContext = {
    phase1: [],
    phase2: [],
    candidates: [],
    validation: [],
    reboundAttempt: 0,
  };

  const allResearch: DiscoveryAgentResearch[] = [];
  const allReports: ReturnType<typeof extractInvestmentReports> = [];
  let reboundCount = 0;

  options.onEvent?.({ type: 'phase', phase: 'collection', message: 'Phase 1: collection' });

  const phase1 = await runAgentBatch({
    agentIds: PHASE1_AGENT_IDS,
    phase: 'collection',
    defaultModel,
    context: options.context,
    phaseContext: null,
    bootstraps: options.bootstraps,
    promptPhase: 'collection',
    onEvent: options.onEvent,
  });

  phaseContext.phase1 = phase1.phaseResults;
  allResearch.push(...phase1.research);
  for (const result of phase1.results) {
    allReports.push(...result.reports, ...extractInvestmentReports(result.text));
  }

  let candidates = mergeCandidates([], phase1.phaseResults.flatMap((p) => p.opportunities));

  options.onEvent?.({ type: 'phase', phase: 'abstraction', message: 'Phase 2: abstraction' });

  const runPhase2 = async (promptPhase: 'abstraction' | 'topup') => {
    phaseContext.candidates = candidates;
    const phase2 = await runAgentBatch({
      agentIds: PHASE2_AGENT_IDS,
      phase: 'abstraction',
      defaultModel,
      context: options.context,
      phaseContext,
      bootstraps: options.bootstraps,
      promptPhase,
      onEvent: options.onEvent,
    });
    phaseContext.phase2 = phase2.phaseResults;
    allResearch.push(...phase2.research);
    for (const result of phase2.results) {
      allReports.push(...result.reports, ...extractInvestmentReports(result.text));
    }
    candidates = mergeCandidates(candidates, phase2.phaseResults.flatMap((p) => p.opportunities));
    phaseContext.candidates = candidates;
  };

  await runPhase2('abstraction');

  let accepted: NormalizedOpportunity[] = [];
  let rejected: Array<{ candidate: NormalizedOpportunity; reasons: string[] }> = [];

  for (let rebound = 0; rebound <= MAX_REBOUNDS; rebound++) {
    phaseContext.reboundAttempt = rebound;
    phaseContext.candidates = candidates;

    options.onEvent?.({
      type: 'phase',
      phase: 'validation',
      message: `Phase 3: validation (rebound ${rebound})`,
    });

    const phase3 = await runAgentBatch({
      agentIds: PHASE3_AGENT_IDS,
      phase: 'validation',
      defaultModel,
      context: options.context,
      phaseContext,
      bootstraps: options.bootstraps,
      promptPhase: 'validation',
      onEvent: options.onEvent,
    });

    allResearch.push(...phase3.research);
    for (const result of phase3.results) {
      allReports.push(...result.reports, ...extractInvestmentReports(result.text));
    }

    const assessments = collectValidationAssessments(phase3.results, PHASE3_AGENT_IDS);
    phaseContext.validation = assessments;

    const validation = validateCandidates(candidates, assessments);
    accepted = validation.accepted;
    rejected = validation.rejected;

    options.onEvent?.({
      type: 'phase_validation_end',
      accepted: accepted.length,
      rejected: rejected.length,
      rebound,
    });

    if (rejected.length === 0 || rebound >= MAX_REBOUNDS) {
      break;
    }

    reboundCount += 1;
    phaseContext.rejectionFeedback = buildRejectionFeedback(rejected);
    options.onEvent?.({
      type: 'phase_rebound_start',
      rebound: reboundCount,
      rejected: rejected.length,
    });

    await runPhase2('abstraction');
    candidates = mergeCandidates(
      accepted,
      phaseContext.phase2.flatMap((p) => p.opportunities)
    );

    options.onEvent?.({ type: 'phase_rebound_end', rebound: reboundCount });
  }

  if (accepted.length < MIN_COMPANIES) {
    options.onEvent?.({
      type: 'phase',
      phase: 'topup',
      message: `Top-up pass: need ${MIN_COMPANIES - accepted.length} more`,
    });

    phaseContext.rejectionFeedback = buildRejectionFeedback(rejected);
    await runPhase2('topup');

    const topUpCandidates = mergeCandidates(accepted, phaseContext.phase2.flatMap((p) => p.opportunities));

    options.onEvent?.({ type: 'phase', phase: 'validation', message: 'Phase 3: top-up validation' });

    const phase3TopUp = await runAgentBatch({
      agentIds: PHASE3_AGENT_IDS,
      phase: 'validation',
      defaultModel,
      context: options.context,
      phaseContext: { ...phaseContext, candidates: topUpCandidates },
      bootstraps: options.bootstraps,
      promptPhase: 'validation',
      onEvent: options.onEvent,
    });

    allResearch.push(...phase3TopUp.research);
    const assessments = collectValidationAssessments(phase3TopUp.results, PHASE3_AGENT_IDS);
    const validation = validateCandidates(topUpCandidates, assessments);
    accepted = validation.accepted;
    rejected = validation.rejected;
    phaseContext.validation = assessments;
    candidates = topUpCandidates;
  }

  phaseContext.candidates = candidates;

  let shortfallExplanation: string | undefined;
  if (accepted.length < MIN_COMPANIES) {
    shortfallExplanation = await explainShortfall({
      accepted,
      rejectedCount: rejected.length,
      reboundCount,
      agentFailures: allResearch
        .filter((a) => a.failed)
        .map((a) => ({ agentId: a.agentId, reason: a.failureReason })),
      phase1Count: phaseContext.phase1.reduce((n, p) => n + p.opportunities.length, 0),
      phase2Count: phaseContext.phase2.reduce((n, p) => n + p.opportunities.length, 0),
    });
  }

  for (const acc of accepted) {
    options.onEvent?.({ type: 'candidate_accepted', ticker: acc.ticker, company: acc.company });
  }
  for (const rej of rejected) {
    options.onEvent?.({
      type: 'candidate_rejected',
      ticker: rej.candidate.ticker,
      company: rej.candidate.company,
      reason: rej.reasons.join('; '),
    });
  }

  return {
    phaseContext,
    accepted,
    rejected,
    allResearch,
    allReports,
    reboundCount,
    shortfallExplanation,
  };
}

export { MIN_COMPANIES, MAX_REBOUNDS };
