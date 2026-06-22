import * as events from '../../domain/events/store';
import * as watchlist from '../../domain/watchlist/watchlist';
import * as pipelineRuns from '../../domain/ops/pipeline-runs';
import {
  monitorNewsAgent,
  monitorRegulatoryAgent,
  monitoringAgents,
} from '../definitions/monitoring/index';
import { decisionAgents, riskAgents, formatterAgent } from '../definitions';
import type { EventWorkflowResult } from '../definitions/types';
import {
  applyUserPolicy,
  buildConfigContext,
  getSystemAccountId,
} from '../policy';
import { extractInvestmentReports, extractMonitoringSignals } from '../runtime/parser';
import { saveReports } from '../reports';
import * as snapshots from '../../domain/watchlist/snapshots';
import { runSpecializedAgent } from '../runtime/subagent';
import * as userConfig from '../../auth/config';
import { enrichReportWithWidgets } from '../../domain/reports/widgets';
import { logError } from '../../infra/db/error-log';

const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'gpt-4';

export async function runEventWorkflow(options: {
  eventId: string;
  model?: string;
  onEvent?: (event: Record<string, unknown>) => void;
}): Promise<EventWorkflowResult> {
  const run = await pipelineRuns.startRun('event', 'event');

  if (!run) {
    return { ok: false, runId: '', eventId: options.eventId, companyId: '', ticker: '' };
  }

  const runId = run.id;
  const event = await events.getById(options.eventId);

  if (!event) {
    await pipelineRuns.failRun(runId, 'event not found');
    return { ok: false, runId, eventId: options.eventId, companyId: '', ticker: '' };
  }

  const company = await watchlist.getById(event.companyId);

  if (!company) {
    await events.markSkipped(event.id);
    await pipelineRuns.failRun(runId, 'company not found');
    return { ok: false, runId, eventId: event.id, companyId: event.companyId, ticker: '' };
  }

  await events.markProcessing(event.id);

  const model = options.model ?? DEFAULT_MODEL;
  const accountId = getSystemAccountId();
  const config = await userConfig.get(accountId);
  const context = buildConfigContext(config);

  const emit = (e: Record<string, unknown>) => {
    options?.onEvent?.({ runId, eventId: event.id, ticker: company.ticker, ...e });
  };

  try {
    const prompt = `Event-triggered rescan for ${company.ticker}.\nEvent: ${event.title}\nSource: ${event.source}\nURL: ${event.url}`;

    const agentsToRun =
      event.eventType === 'regulatory'
        ? [monitorRegulatoryAgent, monitorNewsAgent]
        : event.eventType === 'news'
          ? [monitorNewsAgent, monitorRegulatoryAgent]
          : monitoringAgents.slice(0, 2);

    const monitoringResults = await Promise.all(
      agentsToRun.map((definition) =>
        runSpecializedAgent({ definition, prompt, model, context, onEvent: emit })
      )
    );

    const signals = monitoringResults
      .map((r) => extractMonitoringSignals(r.text))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const payload = JSON.stringify({ company, event, signals }, null, 2);

    const riskResults = await Promise.all(
      riskAgents.map((definition) =>
        runSpecializedAgent({
          definition,
          prompt: `Event-driven risk rescore for ${company.ticker}.\n\n${payload}`,
          model,
          context,
          onEvent: emit,
        })
      )
    );

    const mic = decisionAgents[0]!;
    const decisionResult = await runSpecializedAgent({
      definition: mic,
      prompt: `Update ${company.ticker} recommendation after event.\n\n${payload}`,
      model,
      context,
      onEvent: emit,
    });

    const formatterResult = await runSpecializedAgent({
      definition: formatterAgent,
      prompt: `Format event-driven update for ${company.ticker}.\n\n${decisionResult.text}`,
      model,
      context,
      onEvent: emit,
    });

    let reports = extractInvestmentReports(formatterResult.text);

    if (reports.length === 0) {
      reports = extractInvestmentReports(decisionResult.text);
    }

    if (reports.length > 0) {
      const finalReports = applyUserPolicy(reports, config, riskResults);
      const report = finalReports[0];

      if (report) {
        emit({ type: 'phase', phase: 'widgets', message: `Building widgets for ${company.ticker}` });

        const widgetReport = await enrichReportWithWidgets(report, {
          model,
          context,
          onEvent: emit,
        });

        await saveReports(accountId, runId, [widgetReport]);
        await snapshots.saveSnapshot({
          companyId: company.id,
          riskScore: widgetReport.risk_score,
          confidence: widgetReport.confidence,
          recommendation: widgetReport.recommendation,
          runId,
          metadata: { event: event.id, signals, widgets: widgetReport.widgets },
        });
        await watchlist.markReviewed(company.id, widgetReport.confidence);
      }
    }

    await events.markDone(event.id);
    await pipelineRuns.completeRun(runId, { eventId: event.id, ticker: company.ticker });

    return {
      ok: true,
      runId,
      eventId: event.id,
      companyId: company.id,
      ticker: company.ticker,
    };
  } catch (error) {
      logError(error, { source: 'agents/workflows/event.ts - runEventWorkflow' });
    const message = error instanceof Error ? error.message : 'event workflow failed';
    await events.markSkipped(event.id);
    await pipelineRuns.failRun(runId, message);
    return {
      ok: false,
      runId,
      eventId: event.id,
      companyId: company.id,
      ticker: company.ticker,
    };
  }
}
