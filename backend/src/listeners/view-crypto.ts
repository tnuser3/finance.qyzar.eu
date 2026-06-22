import type { Listener } from '../listeners';
import { listRecent, type SavedReport } from '../agents/reports';
import { filterReportsByAgent, isCryptoReport } from '../domain/reports/evidence-categories';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

function buildCryptoView(reports: SavedReport[]) {
  const cryptoReports = reports.filter(isCryptoReport);
  const tickers = new Set(cryptoReports.map((r) => r.ticker));
  const confidences = cryptoReports.map((r) => r.confidence).filter(Number.isFinite);
  const avgConfidence =
    confidences.length > 0
      ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : null;

  const items = cryptoReports.flatMap((report) =>
    report.evidence
      .filter((e) => e.agent === 'crypto_analysis' || report.agents.includes('crypto_analysis'))
      .slice(0, 3)
      .map((evidence) => ({
        ticker: report.ticker,
        company: report.company,
        recommendation: report.recommendation,
        confidence: report.confidence,
        finding: evidence.finding,
        agent: evidence.agent,
        at: report.generated_at,
      }))
  );

  const recentFindings = items.slice(0, 20).map((item) => ({
    ticker: item.ticker,
    finding: item.finding,
    at: item.at,
  }));

  return {
    summary: {
      reportCount: cryptoReports.length,
      tickerCount: tickers.size,
      avgConfidence,
    },
    items: items.slice(0, 50),
    recentFindings,
  };
}

const config: Listener = {
  event: 'viewCrypto',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    try {
    const limit = Number(payload.limit) || 100;
    const recent = await listRecent(limit);
    const agentFiltered = filterReportsByAgent(recent, ['crypto_analysis']);
    const merged = [...recent.filter(isCryptoReport), ...agentFiltered];
    const unique = Array.from(new Map(merged.map((r) => [r.id, r])).values());

      reply(ws, {
        event: 'viewCrypto',
        ok: true,
        crypto: buildCryptoView(unique),
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-crypto.ts - viewCrypto' });
      reply(ws, {
        event: 'viewCrypto',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load crypto view',
      });
    }
  },
};

export default config;
