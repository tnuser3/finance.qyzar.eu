import * as watchlist from '../../domain/watchlist/watchlist';
import * as pipelineRuns from '../../domain/ops/pipeline-runs';
import { listRecent } from '../reports';
import { marketCorrelationAgent } from '../definitions';
import type { MarketCorrelationRecord, MarketCorrelationWorkflowResult } from '../definitions/types';
import {
  extractMarketCorrelations,
  validateTwoSentenceDescription,
} from '../runtime/parser';
import { runSpecializedAgent } from '../runtime/subagent';
import { logActivity, formatRundownMessage } from '../../domain/ops/activity-log';
import * as correlation from '../../domain/timeline/correlation';
import { getSystemAccountId, buildConfigContext } from '../policy';
import * as userConfig from '../../auth/config';
import { logError } from '../../infra/db/error-log';

const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'gpt-4';
const LOOKBACK_MS = Number(process.env.CORRELATION_LOOKBACK_MS) || 3_600_000;
const MAX_PER_RUN = Number(process.env.CORRELATION_MAX_PER_RUN) || 5;

export async function buildCorrelationContext(
  windowStart: string,
  windowEnd: string
): Promise<Record<string, unknown>> {
  const companies = await watchlist.listActive(50);
  const discoveryRuns = await pipelineRuns.getLatestByWorkflow('discovery', 1);
  const recentReports = await listRecent(30);

  const windowStartMs = new Date(windowStart).getTime();
  const reportsInWindow = recentReports.filter((r) => {
    const created = new Date(r.createdAt).getTime();
    return created >= windowStartMs && created <= new Date(windowEnd).getTime();
  });

  return {
    scanWindow: { from: windowStart, to: windowEnd },
    watchlist: companies.map((c) => ({
      ticker: c.ticker,
      name: c.name,
      industry: c.industry,
      priority: c.watchPriority,
      confidence: c.confidence,
    })),
    lastDiscovery: discoveryRuns[0]
      ? {
          runId: discoveryRuns[0].id,
          completedAt: discoveryRuns[0].completedAt,
          summary: discoveryRuns[0].summary,
        }
      : null,
    recentReportEvidence: (reportsInWindow.length ? reportsInWindow : recentReports.slice(0, 10)).map(
      (r) => ({
        ticker: r.ticker,
        company: r.company,
        recommendation: r.recommendation,
        evidence: r.evidence.slice(0, 5),
        generated_at: r.generated_at,
      })
    ),
    maxCorrelations: MAX_PER_RUN,
  };
}

function resolveWindow(options?: { from?: string; to?: string }): {
  windowStart: string;
  windowEnd: string;
} {
  const windowEnd = options?.to ?? new Date().toISOString();
  const windowStart =
    options?.from ?? new Date(Date.now() - LOOKBACK_MS).toISOString();

  return { windowStart, windowEnd };
}

export async function runMarketCorrelationWorkflow(options?: {
  from?: string;
  to?: string;
  model?: string;
  onEvent?: (event: Record<string, unknown>) => void;
  trigger?: 'scheduled' | 'manual';
}): Promise<MarketCorrelationWorkflowResult> {
  const run = await pipelineRuns.startRun(
    'correlation',
    options?.trigger ?? 'scheduled'
  );

  const { windowStart, windowEnd } = resolveWindow(options);

  if (!run) {
    return {
      ok: false,
      runId: '',
      windowStart,
      windowEnd,
      correlationsFound: 0,
      correlationsSaved: 0,
      correlations: [],
    };
  }

  const runId = run.id;
  const model = options?.model ?? DEFAULT_MODEL;
  const accountId = getSystemAccountId();
  const config = await userConfig.get(accountId);
  const context = buildConfigContext(config);

  const emit = (event: Record<string, unknown>) => {
    const payload = { runId, workflow: 'correlation', ...event };
    logActivity({
      source: 'correlation',
      type: String(event.type ?? 'update'),
      message: formatRundownMessage(event),
      runId,
      agentId: event.agentId ? String(event.agentId) : 'market_correlation',
      data: event,
    });
    options?.onEvent?.(payload);
  };

  try {
    emit({
      type: 'phase',
      phase: 'correlation',
      message: `Market correlation scan ${windowStart} → ${windowEnd}`,
    });

    const ctx = await buildCorrelationContext(windowStart, windowEnd);

    const prompt = `Scan for news-to-price correlations in this time window.

Window: ${windowStart} to ${windowEnd}
Max correlations to return: ${MAX_PER_RUN}

Pipeline context:
${JSON.stringify(ctx, null, 2)}

Find real news events that plausibly correlate with price moves for watchlist tickers.
Return correlation candidates with title, exactly 2-sentence description, evidence, companies, and newsEvents.`;

    const result = await runSpecializedAgent({
      definition: marketCorrelationAgent,
      prompt,
      model,
      context,
      onEvent: emit,
    });

    let candidates = extractMarketCorrelations(result.text);

    for (const child of result.subagentResults) {
      candidates.push(...extractMarketCorrelations(child.text));
    }

    candidates = candidates
      .filter((c) => validateTwoSentenceDescription(c.description))
      .slice(0, MAX_PER_RUN);

    emit({
      type: 'correlation_candidates',
      count: candidates.length,
      message: `Found ${candidates.length} correlation candidates`,
    });

    const saved: MarketCorrelationRecord[] = [];

    for (const candidate of candidates) {
      emit({
        type: 'anchoring',
        ticker: candidate.primaryTicker,
        message: `Anchoring prices for ${candidate.primaryTicker}`,
      });

      const record = await correlation.processCandidate(runId, candidate);
      if (record) saved.push(record);
    }

    await pipelineRuns.completeRun(runId, {
      windowStart,
      windowEnd,
      correlationsFound: candidates.length,
      correlationsSaved: saved.length,
    });

    emit({
      type: 'correlation_complete',
      correlationsSaved: saved.length,
      message: `Saved ${saved.length} market correlations`,
    });

    return {
      ok: true,
      runId,
      windowStart,
      windowEnd,
      correlationsFound: candidates.length,
      correlationsSaved: saved.length,
      correlations: saved,
    };
  } catch (error) {
      logError(error, { source: 'agents/workflows/correlation.ts - runMarketCorrelationWorkflow' });
    const message = error instanceof Error ? error.message : 'correlation failed';
    await pipelineRuns.failRun(runId, message);
    emit({ type: 'error', error: message });

    return {
      ok: false,
      runId,
      windowStart,
      windowEnd,
      correlationsFound: 0,
      correlationsSaved: 0,
      correlations: [],
    };
  }
}
