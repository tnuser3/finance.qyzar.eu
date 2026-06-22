import * as userConfig from '../../auth/config';

import * as watchlist from '../../domain/watchlist/watchlist';

import * as pipelineRuns from '../../domain/ops/pipeline-runs';

import {

  beginDiscoveryRun,

  discoveryOnEvent,

  endDiscoveryRun,

} from '../../domain/ops/discovery-status';

import { dailyDiscoveryAgents } from '../definitions';

import type { DiscoveryWorkflowResult } from '../definitions/types';

import { bootstrapAllDiscoveryAgents } from '../discovery/bootstrap';

import {

  acceptedDossiers,

  buildDiscoveryDossiersFromOpportunities,

} from '../discovery/dossier';

import { runPhasedDiscovery } from '../discovery/phases';

import {
  DEFAULT_AGENT_MODEL,
  discoveryAgentModelMap,
  DOSSIER_SYNTHESIS_MODEL,
} from '../runtime/types';

import { buildConfigContext } from '../policy';

import { saveReports } from '../reports';

import '../commands/index';
import { logError } from '../../infra/db/error-log';



const DEFAULT_MODEL = DEFAULT_AGENT_MODEL;

const SYSTEM_ACCOUNT_ID =

  process.env.SYSTEM_ACCOUNT_ID ?? '00000000-0000-0000-0000-000000000001';



export async function runDiscoveryWorkflow(options?: {

  model?: string;

  onEvent?: (event: Record<string, unknown>) => void;

  trigger?: 'scheduled' | 'manual';

  force?: boolean;

}): Promise<DiscoveryWorkflowResult> {

  const run = await pipelineRuns.startRun('discovery', options?.trigger ?? 'scheduled', {

    force: options?.force,

  });



  if (!run) {

    return {

      ok: false,

      runId: '',

      newOpportunities: [],

      companiesAdded: 0,

      companies: [],

      error: 'discovery already running',

    };

  }



  const runId = run.id;

  const model = options?.model ?? DEFAULT_MODEL;

  const workflowStarted = Date.now();



  const config = await userConfig.get(SYSTEM_ACCOUNT_ID);

  const context = buildConfigContext(config);



  beginDiscoveryRun(runId);



  const emit = (event: Record<string, unknown>) => {

    const payload = { runId, workflow: 'discovery', ...event };

    discoveryOnEvent(payload);

    options?.onEvent?.(payload);

  };



  try {

    emit({ type: 'phase', phase: 'discovery', message: 'Phased discovery workflow' });



    const agentIds = dailyDiscoveryAgents.map((definition) => definition.id);

    const bootstraps = await bootstrapAllDiscoveryAgents(agentIds, emit);



    emit({
      type: 'workflow_models',
      defaultModel: model,
      agentModels: discoveryAgentModelMap(),
    });

    const phased = await runPhasedDiscovery({

      defaultModel: model,

      context,

      bootstraps,

      onEvent: emit,

    });



    emit({ type: 'phase', phase: 'synthesis', message: 'Building company dossiers' });



    const dossiers = await buildDiscoveryDossiersFromOpportunities({

      opportunities: phased.accepted,

      model: DOSSIER_SYNTHESIS_MODEL,

    });



    const acceptedDossierList = acceptedDossiers(dossiers);
    const rejectedDossiers = phased.rejected.map((row) => ({
      ticker: row.candidate.ticker ?? watchlist.generateEmergingTicker(row.candidate.company),
      name: row.candidate.company,
      industry: row.candidate.industry,
      confidence: row.candidate.confidence,
      recommendation: 'REJECT',
      title: row.candidate.title,
      listingStatus: row.candidate.listingStatus,
      titanScore: row.candidate.titanScore,
      riskScore: row.candidate.risk_score,
      discoveredBy: row.candidate.discoveredBy,
      summary: row.candidate.description,
      whyAdded: row.candidate.evidence.map((e) => e.reason).join(' '),
      risk: row.reasons.join('; '),
      opportunity: '',
      industryContext: row.candidate.industry,
      rivals: '',
      geopolitics: '',
      stockSnapshot: {},
      evidence: row.candidate.evidence.map((e) => ({
        source: e.source,
        kind: 'agent evidence',
        detail: e.summary,
        rawData: e.rawData,
        reason: e.reason,
      })),
      synthesized: false,
      rejected: true,
      rejectReason: row.reasons.join('; '),
    }));



    const tickerSet = new Set<string>();

    const upsertInputs: watchlist.UpsertCompanyInput[] = [];



    for (const dossier of acceptedDossierList) {

      const isEmerging = dossier.listingStatus && dossier.listingStatus !== 'listed';

      let ticker = dossier.ticker;



      if (isEmerging && !ticker.startsWith('EMRG-')) {

        ticker = watchlist.generateEmergingTicker(dossier.name, tickerSet);

      }



      tickerSet.add(ticker);



      upsertInputs.push({

        ticker,

        name: dossier.name,

        industry: dossier.industry,

        confidence: dossier.confidence,

        discoveredBy: 'discovery_workflow',

        status: isEmerging ? 'emerging' : 'active',

      });

    }



    const savedReports =

      phased.allReports.length > 0

        ? await saveReports(SYSTEM_ACCOUNT_ID, runId, phased.allReports)

        : 0;



    emit({ type: 'reports_saved', count: savedReports });



    const upserted = await watchlist.upsertMany(upsertInputs);



    const companies = acceptedDossierList.map((d, index) => ({

      ticker: upsertInputs[index]?.ticker ?? d.ticker,

      name: d.name,

      industry: d.industry,

      confidence: d.confidence,

    }));



    const newOpportunities = [

      ...new Set(phased.accepted.map((o) => o.industry)),

    ];



    await pipelineRuns.completeRun(runId, {

      newOpportunities,

      companiesAdded: upserted.length,

      reportsSaved: savedReports,

    });



    endDiscoveryRun(true, { companiesAdded: upserted.length, reportsSaved: savedReports });

    emit({

      type: 'discovery_complete',

      companiesAdded: upserted.length,

      reportsSaved: savedReports,

      reboundCount: phased.reboundCount,

    });



    const durationMs = Date.now() - workflowStarted;



    return {

      ok: true,

      runId,

      newOpportunities,

      companiesAdded: upserted.length,

      companies,

      reportsSaved: savedReports,

      agents: phased.allResearch,

      dossiers: acceptedDossierList.map((d, index) => ({

        ...d,

        ticker: upsertInputs[index]?.ticker ?? d.ticker,

      })),

      rejectedCandidates: rejectedDossiers,

      phaseContext: phased.phaseContext,

      reboundCount: phased.reboundCount,

      shortfallExplanation: phased.shortfallExplanation,

      durationMs,

    };

  } catch (error) {
      logError(error, { source: 'agents/workflows/discovery.ts - runDiscoveryWorkflow' });

    const message = error instanceof Error ? error.message : 'discovery failed';

    await pipelineRuns.failRun(runId, message);

    endDiscoveryRun(false, { error: message });

    emit({ type: 'error', error: message });



    return {

      ok: false,

      runId,

      newOpportunities: [],

      companiesAdded: 0,

      companies: [],

      error: message,

      durationMs: Date.now() - workflowStarted,

    };

  }

}

