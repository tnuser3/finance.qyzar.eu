import type { Listener } from '../listeners';
import { getByTicker, getByRunId } from '../agents/reports';
import { buildFallbackWidgets } from '../domain/reports/presentation';
import type { InvestmentReport } from '../agents/definitions/types';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

function widgetsForReport(report: InvestmentReport & { widgets?: InvestmentReport['widgets'] }) {
  if (report.widgets?.length) return report.widgets;
  return buildFallbackWidgets(report);
}

const config: Listener = {
  event: 'viewReportWidgets',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const ticker = asString(payload.ticker).trim().toUpperCase();
    const runId = asString(payload.runId);
    const reportId = asString(payload.reportId);
    try {
      let reports;
    if (runId) {
        reports = await getByRunId(runId);
      } else if (ticker) {
        reports = await getByTicker(ticker, 5);
      } else {
        reply(ws, {
          event: 'viewReportWidgets',
          ok: false,
          error: 'ticker or runId is required',
        });
        return;
      }
    if (reportId) {
        reports = reports.filter((r) => r.id === reportId);
      }
    if (reports.length === 0) {
        reply(ws, {
          event: 'viewReportWidgets',
          ok: false,
          error: 'no reports found',
        });
        return;
      }
    const latest = reports[0]!;

      reply(ws, {
        event: 'viewReportWidgets',
        ok: true,
        ticker: latest.ticker,
        company: latest.company,
        runId: latest.runId,
        reportId: latest.id,
        widgets: widgetsForReport(latest),
        reports: reports.map((r) => ({
          id: r.id,
          runId: r.runId,
          ticker: r.ticker,
          company: r.company,
          recommendation: r.recommendation,
          createdAt: r.createdAt,
          widgetCount: widgetsForReport(r).length,
          widgets: widgetsForReport(r),
        })),
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-report-widgets.ts - viewReportWidgets' });
      reply(ws, {
        event: 'viewReportWidgets',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load widgets',
      });
    }
  },
};

export default config;
