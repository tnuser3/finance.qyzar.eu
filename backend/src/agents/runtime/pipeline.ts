import { randomUUID } from 'crypto';
import * as userConfig from '../../auth/config';
import {
  decisionAgents,
  discoveryAgents,
  formatterAgent,
  riskAgents,
} from '../definitions';
import type { InvestmentReport, PipelineRunResult } from '../definitions/types';
import { applyUserPolicy, buildConfigContext } from '../policy';
import { extractInvestmentReports } from './parser';
import { saveReports } from '../reports';
import { runSpecializedAgent } from './subagent';
import * as watchlist from '../../domain/watchlist/watchlist';
import { horizonToLabel } from '../../auth/config';
import { enrichReportsWithWidgets } from '../../domain/reports/presentation';

function mergeDiscoveryReports(
  results: Awaited<ReturnType<typeof runSpecializedAgent>>[]
): InvestmentReport[] {
  const reports: InvestmentReport[] = [];

  for (const result of results) {
    reports.push(...extractInvestmentReports(result.text));

    for (const child of result.subagentResults) {
      reports.push(...extractInvestmentReports(child.text));
    }
  }

  return reports;
}

export async function runPipeline(options: {
  accountId: string;
  model: string;
  focus?: string;
  onEvent?: (event: Record<string, unknown>) => void;
}): Promise<PipelineRunResult> {
  const runId = randomUUID();
  const config = await userConfig.get(options.accountId);
  const context = buildConfigContext(config);
  const horizonLabel = horizonToLabel(config.timeHorizon);

  const emit = (event: Record<string, unknown>) => {
    options.onEvent?.({ runId, ...event });
  };

  emit({
    type: 'phase',
    phase: 'discovery',
    message: 'Running 7 discovery agents in parallel',
  });

  const discoveryPrompt =
    options.focus ??
    'Run a full market discovery scan: macro, earnings, technical, commodities, opportunities, conservation, and crypto.';

  const discoveryResults = await Promise.all(
    discoveryAgents.map((definition) =>
      runSpecializedAgent({
        definition,
        prompt: discoveryPrompt,
        model: options.model,
        context,
        onEvent: emit,
      })
    )
  );

  const discoveryReports = mergeDiscoveryReports(discoveryResults);

  emit({
    type: 'discovery_complete',
    agents: discoveryResults.map((r) => r.agentId),
    reportCount: discoveryReports.length,
  });

  const discoveryPayload = JSON.stringify(
    {
      reports: discoveryReports,
      agentSummaries: discoveryResults.map((r) => ({
        agent: r.agentId,
        text: r.text,
      })),
    },
    null,
    2
  );

  emit({
    type: 'phase',
    phase: 'risk',
    message: 'Running 5 risk specialists in parallel',
  });

  const riskResults = await Promise.all(
    riskAgents.map((definition) =>
      runSpecializedAgent({
        definition,
        prompt: `Review discovery payload and apply your risk specialty.\n\n${discoveryPayload}`,
        model: options.model,
        context,
        onEvent: emit,
      })
    )
  );

  emit({
    type: 'risk_complete',
    agents: riskResults.map((r) => r.agentId),
  });

  const riskPayload = JSON.stringify(
    riskResults.map((r) => ({
      agent: r.agentId,
      assessment: r.risk,
      summary: r.text,
    })),
    null,
    2
  );

  emit({
    type: 'phase',
    phase: 'decision',
    message: 'Master Investment Committee review',
  });

  const micAgent = decisionAgents[0]!;

  const decisionResult = await runSpecializedAgent({
    definition: micAgent,
    prompt: `Review all evidence and produce final investment recommendations.

Discovery:
${discoveryPayload}

Risk assessments:
${riskPayload}

Apply user config strictly. Resolve conflicts between agents.`,
    model: options.model,
    context,
    onEvent: emit,
  });

  let micReports = extractInvestmentReports(decisionResult.text, horizonLabel);

  emit({ type: 'decision_complete', reportCount: micReports.length });

  emit({ type: 'phase', phase: 'format', message: 'Formatting final report' });

  const formatterResult = await runSpecializedAgent({
    definition: formatterAgent,
    prompt: `Normalize MIC output into database-ready InvestmentReport records.

MIC output:
${decisionResult.text}

Risk payload:
${riskPayload}

User time_horizon: ${horizonLabel}`,
    model: options.model,
    context,
    onEvent: emit,
  });

  let report = extractInvestmentReports(formatterResult.text, horizonLabel);

  if (report.length === 0) {
    report = micReports;
  }

  if (report.length === 0) {
    report = applyUserPolicy(discoveryReports, config, riskResults);
  } else {
    report = applyUserPolicy(report, config, riskResults);
  }

  emit({ type: 'phase', phase: 'widgets', message: 'Translating evidence into mobile widgets' });

  report = await enrichReportsWithWidgets(report, {
    model: options.model,
    context,
    onEvent: emit,
  });

  const savedCount = await saveReports(options.accountId, runId, report);

  await watchlist.seedFromReports(
    report.map((r) => ({
      ticker: r.ticker,
      company: r.company,
      industry: r.industry,
      confidence: r.confidence,
    })),
    'pipeline'
  );

  emit({ type: 'pipeline_complete', savedCount });

  return {
    ok: true,
    runId,
    accountId: options.accountId,
    discovery: {
      agents: discoveryResults.map((r) => ({
        id: r.agentId,
        summary: r.text,
      })),
    },
    risk: {
      agents: riskResults.map((r) => ({
        id: r.agentId,
        assessment: r.risk,
        summary: r.text,
      })),
    },
    decision: {
      agent: decisionResult.agentId,
      summary: decisionResult.text,
      reports: micReports,
    },
    report,
    savedCount,
  };
}
