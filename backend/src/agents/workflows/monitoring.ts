import * as userConfig from '../../auth/config';
import * as watchlist from '../../domain/watchlist/watchlist';
import * as snapshots from '../../domain/watchlist/snapshots';
import * as pipelineRuns from '../../domain/ops/pipeline-runs';
import { logActivity, formatRundownMessage } from '../../domain/ops/activity-log';
import {
  decisionAgents,
  formatterAgent,
  monitoringAgents,
  riskAgents,
} from '../definitions';
import type { MonitoringWorkflowResult, Recommendation } from '../definitions/types';
import {
  applyUserPolicy,
  buildConfigContext,
  getSystemAccountId,
} from '../policy';
import { extractInvestmentReports, extractMonitoringSignals } from '../runtime/parser';
import { saveReports } from '../reports';
import { runSpecializedAgent } from '../runtime/subagent';
import type { WatchlistCompany, WatchPriority } from '../../domain/watchlist/watchlist';
import { RateLimitUnavailableError } from '../../infra/http/fetch';
import { enrichReportWithWidgets } from '../../domain/reports/widgets';
import { logError } from '../../infra/db/error-log';

const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'gpt-4';

async function scanCompany(
  company: WatchlistCompany,
  model: string,
  context: string,
  runId: string,
  accountId: string,
  onEvent?: (event: Record<string, unknown>) => void
): Promise<{ reportSaved: boolean; snapshotSaved: boolean }> {
  const emit = (event: Record<string, unknown>) => {
    onEvent?.({ runId, ticker: company.ticker, ...event });
  };

  const companyPrompt = `Monitor watchlist company: ${company.name} (${company.ticker}), industry: ${company.industry}. Focus only on this ticker.`;

  let monitoringResults;

  try {
    monitoringResults = await Promise.all(
      monitoringAgents.map((definition) =>
        runSpecializedAgent({
          definition,
          prompt: companyPrompt,
          model,
          context,
          onEvent: emit,
        })
      )
    );
  } catch (error) {
      logError(error, { source: 'agents/workflows/monitoring.ts - scanCompany' });
    if (error instanceof RateLimitUnavailableError) {
      await watchlist.deferScan(company.id, error.retryAfterMs);
      return { reportSaved: false, snapshotSaved: false };
    }
    throw error;
  }

  const signals = monitoringResults
    .map((r) => extractMonitoringSignals(r.text))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const monitoringPayload = JSON.stringify({ company, signals }, null, 2);

  const riskResults = await Promise.all(
    riskAgents.map((definition) =>
      runSpecializedAgent({
        definition,
        prompt: `Re-score risk for watchlist company only.\n\n${monitoringPayload}`,
        model,
        context,
        onEvent: emit,
      })
    )
  );

  const micAgent = decisionAgents[0]!;
  const decisionResult = await runSpecializedAgent({
    definition: micAgent,
    prompt: `Update recommendation for ${company.ticker} only based on monitoring and risk data.\n\n${monitoringPayload}\n\nRisk:\n${JSON.stringify(riskResults.map((r) => r.risk))}`,
    model,
    context,
    onEvent: emit,
  });

  const formatterResult = await runSpecializedAgent({
    definition: formatterAgent,
    prompt: `Format single-company MIC output for ${company.ticker}.\n\n${decisionResult.text}`,
    model,
    context,
    onEvent: emit,
  });

  let reports = extractInvestmentReports(formatterResult.text);

  if (reports.length === 0) {
    reports = extractInvestmentReports(decisionResult.text);
  }

  if (reports.length === 0) {
    const avgRisk =
      signals.reduce((sum, s) => sum + (s.risk_score ?? 50), 0) /
      Math.max(signals.length, 1);

    reports = [
      {
        company: company.name,
        ticker: company.ticker,
        industry: company.industry,
        recommendation: 'HOLD' as Recommendation,
        confidence: company.confidence,
        risk_score: Math.round(avgRisk),
        agents: monitoringResults.map((r) => r.agentId),
        evidence: signals.flatMap((s) =>
          (s.signals ?? []).map((sig) => ({
            agent: sig.source,
            finding: sig.finding,
          }))
        ),
        statistics: { monitoring: signals },
        time_horizon: '12 months',
        generated_at: new Date().toISOString(),
      },
    ];
  }

  const config = await userConfig.get(accountId);
  const finalReports = applyUserPolicy(reports, config, riskResults);
  const report = finalReports[0];

  if (!report) {
    await watchlist.markReviewed(company.id);
    return { reportSaved: false, snapshotSaved: false };
  }

  emit({ type: 'phase', phase: 'widgets', message: `Building widgets for ${company.ticker}` });

  const widgetReport = await enrichReportWithWidgets(report, {
    model,
    context,
    onEvent: emit,
  });

  await saveReports(accountId, runId, [widgetReport]);

  const sentimentScore =
    signals.find((s) => s.sentiment_score != null)?.sentiment_score ?? null;
  const growthScore =
    signals.find((s) => s.growth_score != null)?.growth_score ?? null;

  await snapshots.saveSnapshot({
    companyId: company.id,
    riskScore: widgetReport.risk_score,
    confidence: widgetReport.confidence,
    recommendation: widgetReport.recommendation,
    sentimentScore,
    growthScore,
    marketCap:
      report.statistics?.market_cap != null
        ? Number(report.statistics.market_cap)
        : null,
    runId,
    metadata: { signals, agents: monitoringResults.map((r) => r.agentId) },
  });

  await watchlist.markReviewed(company.id, widgetReport.confidence);

  return { reportSaved: true, snapshotSaved: true };
}

export async function runMonitoringWorkflow(options: {
  priority: WatchPriority;
  model?: string;
  onEvent?: (event: Record<string, unknown>) => void;
  trigger?: 'scheduled' | 'manual';
}): Promise<MonitoringWorkflowResult> {
  const run = await pipelineRuns.startRun('monitoring', options.trigger ?? 'scheduled');

  if (!run) {
    return {
      ok: false,
      runId: '',
      priority: options.priority,
      companiesScanned: 0,
      reportsSaved: 0,
      snapshotsSaved: 0,
    };
  }

  const runId = run.id;
  const model = options.model ?? DEFAULT_MODEL;
  const accountId = getSystemAccountId();
  const config = await userConfig.get(accountId);
  const context = buildConfigContext(config);

  const emit = (event: Record<string, unknown>) => {
    const payload = {
      runId,
      workflow: 'monitoring',
      priority: options.priority,
      ...event,
    };

    logActivity({
      source: 'monitoring',
      type: String(event.type ?? 'update'),
      message: formatRundownMessage(event),
      runId,
      ticker: event.ticker ? String(event.ticker) : undefined,
      agentId: event.agentId ? String(event.agentId) : undefined,
      data: event,
    });

    options?.onEvent?.(payload);
  };

  try {
    const due = await watchlist.getDueForScan(options.priority);

    emit({
      type: 'phase',
      phase: 'monitoring',
      message: `Scanning P${options.priority} batch (${due.length} companies)`,
    });

    let reportsSaved = 0;
    let snapshotsSaved = 0;

    for (const company of due) {
      try {
        const result = await scanCompany(
          company,
          model,
          context,
          runId,
          accountId,
          emit
        );

        if (result.reportSaved) reportsSaved++;
        if (result.snapshotSaved) snapshotsSaved++;
      } catch (error) {
      logError(error, { source: 'agents/workflows/monitoring.ts - runMonitoringWorkflow' });
        if (error instanceof RateLimitUnavailableError) {
          await watchlist.deferScan(company.id, error.retryAfterMs);
          continue;
        }
        emit({
          type: 'company_error',
          ticker: company.ticker,
          error: error instanceof Error ? error.message : 'scan failed',
        });
      }
    }

    await pipelineRuns.completeRun(runId, {
      priority: options.priority,
      companiesScanned: due.length,
      reportsSaved,
      snapshotsSaved,
    });

    emit({ type: 'monitoring_complete', companiesScanned: due.length, reportsSaved });

    return {
      ok: true,
      runId,
      priority: options.priority,
      companiesScanned: due.length,
      reportsSaved,
      snapshotsSaved,
    };
  } catch (error) {
      logError(error, { source: 'agents/workflows/monitoring.ts - runMonitoringWorkflow' });
    const message = error instanceof Error ? error.message : 'monitoring failed';
    await pipelineRuns.failRun(runId, message);
    return {
      ok: false,
      runId,
      priority: options.priority,
      companiesScanned: 0,
      reportsSaved: 0,
      snapshotsSaved: 0,
    };
  }
}
