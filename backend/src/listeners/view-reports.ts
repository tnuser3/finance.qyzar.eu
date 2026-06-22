import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import { listForAccounts } from '../agents/reports';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewReports',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const limit = Number(payload.limit) || 50;
    const ticker = asString(payload.ticker).trim().toUpperCase();
    try {
      let reports = await listForAccounts([getSystemAccountId()], limit);

      if (ticker) {
        reports = reports.filter((r) => r.ticker === ticker);
      }

      reply(ws, {
        event: 'viewReports',
        ok: true,
        count: reports.length,
        reports: reports.map((r) => ({
          id: r.id,
          runId: r.runId,
          company: r.company,
          ticker: r.ticker,
          industry: r.industry,
          recommendation: r.recommendation,
          confidence: r.confidence,
          risk_score: r.risk_score,
          approved: r.approved,
          restriction_reason: r.restriction_reason,
          time_horizon: r.time_horizon,
          generated_at: r.generated_at,
          createdAt: r.createdAt,
          evidenceCount: r.evidence.length,
          widgetCount: r.widgets?.length ?? 0,
          widgets: r.widgets ?? [],
          agents: r.agents,
        })),
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-reports.ts - viewReports' });
      reply(ws, {
        event: 'viewReports',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load reports',
      });
    }
  },
};

export default config;
