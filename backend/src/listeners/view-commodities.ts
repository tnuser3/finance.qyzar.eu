import type { Listener } from '../listeners';
import { listRecent, type SavedReport } from '../agents/reports';
import { filterReportsByAgent, isCommodityReport } from '../domain/reports/evidence-categories';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

function pickBias(reports: SavedReport[], key: string): string | null {
  for (const report of reports) {
    const value = report.statistics?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function buildCommoditiesView(reports: SavedReport[]) {
  const commodityReports = reports.filter(isCommodityReport);
  const tickers = new Set(commodityReports.map((r) => r.ticker));

  const items = commodityReports.flatMap((report) =>
    report.evidence
      .filter((e) => e.agent === 'commodities' || report.agents.includes('commodities'))
      .slice(0, 3)
      .map((evidence) => ({
        ticker: report.ticker,
        company: report.company,
        recommendation: report.recommendation,
        finding: evidence.finding,
        agent: evidence.agent,
        at: report.generated_at,
      }))
  );

  return {
    summary: {
      reportCount: commodityReports.length,
      tickerCount: tickers.size,
      supplyBias: pickBias(commodityReports, 'supplyBias'),
      demandBias: pickBias(commodityReports, 'demandBias'),
    },
    items: items.slice(0, 50),
    recentFindings: items.slice(0, 20).map((item) => ({
      ticker: item.ticker,
      finding: item.finding,
      at: item.at,
    })),
  };
}

const config: Listener = {
  event: 'viewCommodities',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    try {
    const limit = Number(payload.limit) || 100;
    const recent = await listRecent(limit);
    const agentFiltered = filterReportsByAgent(recent, ['commodities']);
    const merged = [...recent.filter(isCommodityReport), ...agentFiltered];
    const unique = Array.from(new Map(merged.map((r) => [r.id, r])).values());

      reply(ws, {
        event: 'viewCommodities',
        ok: true,
        commodities: buildCommoditiesView(unique),
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-commodities.ts - viewCommodities' });
      reply(ws, {
        event: 'viewCommodities',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load commodities view',
      });
    }
  },
};

export default config;
