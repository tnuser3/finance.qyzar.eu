import type { Listener } from '../listeners';
import { listCorrelations } from '../domain/timeline/correlation';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewMarketCorrelations',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const from = asString(payload.from) || undefined;
    const to = asString(payload.to) || undefined;
    const ticker = asString(payload.ticker).trim().toUpperCase() || undefined;
    const limit = Number(payload.limit) || 50;
    try {
    const correlations = await listCorrelations({ from, to, ticker, limit });

      reply(ws, {
        event: 'viewMarketCorrelations',
        ok: true,
        count: correlations.length,
        correlations: correlations.map((c) => ({
          id: c.id,
          runId: c.runId,
          title: c.title,
          description: c.description,
          windowStart: c.windowStart,
          windowEnd: c.windowEnd,
          primaryTicker: c.primaryTicker,
          companies: c.companies,
          evidence: c.evidence,
          newsEvents: c.newsEvents,
          priceMove: c.priceMove,
          widgets: c.widgets,
          confidence: c.confidence,
          createdAt: c.createdAt,
        })),
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-market-correlations.ts - viewMarketCorrelations' });
      reply(ws, {
        event: 'viewMarketCorrelations',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load correlations',
      });
    }
  },
};

export default config;
