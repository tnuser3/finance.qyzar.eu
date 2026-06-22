import * as watchlist from '../../domain/watchlist/watchlist';
import * as pipelineRuns from '../../domain/ops/pipeline-runs';
import { watchlistReviewerAgent } from '../definitions';
import type {
  MarketCorrelationRecord,
  WatchlistReviewRecord,
  WatchlistReviewerWorkflowResult,
} from '../definitions/types';
import {
  extractMarketCorrelations,
  extractWatchlistReviews,
  validateTwoSentenceDescription,
} from '../runtime/parser';
import { runSpecializedAgent } from '../runtime/subagent';
import { logActivity, formatRundownMessage } from '../../domain/ops/activity-log';
import * as correlation from '../../domain/timeline/correlation';
import { getSystemAccountId, buildConfigContext } from '../policy';
import * as userConfig from '../../auth/config';
import { getUsMarketDayWindow } from '../../domain/timeline/market-hours';
import { buildCorrelationContext } from './correlation';
import { logError } from '../../infra/db/error-log';

const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'gpt-4';
const MAX_REVIEWS = Number(process.env.WATCHLIST_REVIEWER_MAX_COMPANIES) || 100;
const MAX_CORRELATIONS = Number(process.env.WATCHLIST_REVIEWER_MAX_CORRELATIONS) || 12;

export async function runWatchlistReviewerWorkflow(options?: {
  tradingDay?: string;
  model?: string;
  onEvent?: (event: Record<string, unknown>) => void;
  trigger?: 'scheduled' | 'manual';
}): Promise<WatchlistReviewerWorkflowResult> {
  const dayWindow = getUsMarketDayWindow();

  if (!dayWindow) {
    return {
      ok: false,
      runId: '',
      tradingDay: options?.tradingDay ?? '',
      windowStart: '',
      windowEnd: '',
      companiesReviewed: 0,
      reviewsSaved: 0,
      correlationsFound: 0,
      correlationsSaved: 0,
      reviews: [],
      correlations: [],
      message: 'Skipped — not a US market weekday.',
    };
  }

  const { tradingDay, windowStart, windowEnd } = dayWindow;
  const run = await pipelineRuns.startRun(
    'watchlist_reviewer',
    options?.trigger ?? 'scheduled'
  );

  if (!run) {
    return {
      ok: false,
      runId: '',
      tradingDay,
      windowStart,
      windowEnd,
      companiesReviewed: 0,
      reviewsSaved: 0,
      correlationsFound: 0,
      correlationsSaved: 0,
      reviews: [],
      correlations: [],
      message: 'Could not start pipeline run.',
    };
  }

  const runId = run.id;
  const model = options?.model ?? DEFAULT_MODEL;
  const accountId = getSystemAccountId();
  const config = await userConfig.get(accountId);
  const context = buildConfigContext(config);

  const emit = (event: Record<string, unknown>) => {
    const payload = { runId, workflow: 'watchlist_reviewer', tradingDay, ...event };
    logActivity({
      source: 'watchlist_reviewer',
      type: String(event.type ?? 'update'),
      message: formatRundownMessage(event),
      runId,
      agentId: event.agentId ? String(event.agentId) : 'watchlist_reviewer',
      ticker: event.ticker ? String(event.ticker) : undefined,
      data: event,
    });
    options?.onEvent?.(payload);
  };

  try {
    emit({
      type: 'phase',
      phase: 'watchlist_review',
      message: `Watchlist end-of-day review for ${tradingDay}`,
    });

    const companies = (await watchlist.listActive(MAX_REVIEWS)).slice(0, MAX_REVIEWS);
    const ctx = await buildCorrelationContext(windowStart, windowEnd);

    const prompt = `Run the end-of-day watchlist review for the full US regular session.

Trading day: ${tradingDay}
Session window: ${windowStart} to ${windowEnd}
Watchlist companies to review: ${companies.length}
Max correlations to return: ${MAX_CORRELATIONS}

Pipeline context:
${JSON.stringify(
  {
    ...ctx,
    reviewTargets: companies.map((company) => ({
      ticker: company.ticker,
      name: company.name,
      industry: company.industry,
      priority: company.watchPriority,
      confidence: company.confidence,
    })),
  },
  null,
  2
)}

Instructions:
- Read news from the entire session window for each watchlist ticker.
- Return one review per ticker with headline, 2-sentence summary, sentiment, confidence, newsHighlights, and evidence.
- Return correlation candidates when a headline plausibly explains a move during the session.
- Finish with a concise daySummary for the whole watchlist.`;

    const result = await runSpecializedAgent({
      definition: watchlistReviewerAgent,
      prompt,
      model,
      context,
      onEvent: emit,
    });

    let reviews = extractWatchlistReviews(result.text);
    let candidates = extractMarketCorrelations(result.text);

    for (const child of result.subagentResults) {
      reviews.push(...extractWatchlistReviews(child.text));
      candidates.push(...extractMarketCorrelations(child.text));
    }

    reviews = reviews
      .filter((review) => validateTwoSentenceDescription(review.summary))
      .slice(0, companies.length);

    candidates = candidates
      .filter((candidate) => validateTwoSentenceDescription(candidate.description))
      .slice(0, MAX_CORRELATIONS);

    emit({
      type: 'review_candidates',
      count: reviews.length,
      message: `Prepared ${reviews.length} watchlist reviews`,
    });

    const savedReviews: WatchlistReviewRecord[] = [];

    for (const review of reviews) {
      const company = await watchlist.getByTicker(review.ticker);

      if (!company) {
        continue;
      }

      await watchlist.markReviewed(company.id, review.confidence ?? company.confidence);

      savedReviews.push({
        ...review,
        companyId: company.id,
        tradingDay,
        windowStart,
        windowEnd,
        runId,
      });

      emit({
        type: 'review_saved',
        ticker: review.ticker,
        headline: review.headline,
        message: `Reviewed ${review.ticker}: ${review.headline}`,
      });
    }

    emit({
      type: 'correlation_candidates',
      count: candidates.length,
      message: `Found ${candidates.length} end-of-day correlation candidates`,
    });

    const savedCorrelations: MarketCorrelationRecord[] = [];

    for (const candidate of candidates) {
      emit({
        type: 'anchoring',
        ticker: candidate.primaryTicker,
        message: `Anchoring end-of-day prices for ${candidate.primaryTicker}`,
      });

      const record = await correlation.processCandidate(runId, {
        ...candidate,
        windowStart: candidate.windowStart || windowStart,
        windowEnd: candidate.windowEnd || windowEnd,
      });

      if (record) {
        savedCorrelations.push(record);
      }
    }

    await pipelineRuns.completeRun(runId, {
      tradingDay,
      windowStart,
      windowEnd,
      companiesReviewed: companies.length,
      reviewsSaved: savedReviews.length,
      correlationsFound: candidates.length,
      correlationsSaved: savedCorrelations.length,
    });

    emit({
      type: 'watchlist_review_complete',
      reviewsSaved: savedReviews.length,
      correlationsSaved: savedCorrelations.length,
      message: `Saved ${savedReviews.length} reviews and ${savedCorrelations.length} correlations`,
    });

    return {
      ok: true,
      runId,
      tradingDay,
      windowStart,
      windowEnd,
      companiesReviewed: companies.length,
      reviewsSaved: savedReviews.length,
      correlationsFound: candidates.length,
      correlationsSaved: savedCorrelations.length,
      reviews: savedReviews,
      correlations: savedCorrelations,
    };
  } catch (error) {
      logError(error, { source: 'agents/workflows/watchlist-reviewer.ts - runWatchlistReviewerWorkflow' });
    const message =
      error instanceof Error ? error.message : 'watchlist review failed';

    await pipelineRuns.failRun(runId, message);
    emit({ type: 'error', error: message });

    return {
      ok: false,
      runId,
      tradingDay,
      windowStart,
      windowEnd,
      companiesReviewed: 0,
      reviewsSaved: 0,
      correlationsFound: 0,
      correlationsSaved: 0,
      reviews: [],
      correlations: [],
      message,
    };
  }
}
