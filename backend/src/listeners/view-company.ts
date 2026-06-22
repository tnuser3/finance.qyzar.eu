import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { searchCompany } from '../domain/watchlist/company-search';
import * as watchlist from '../domain/watchlist/watchlist';
import * as snapshots from '../domain/watchlist/snapshots';
import { getByTicker } from '../agents/reports';
import { profile as fmpProfile } from '../providers/market/fmp';
import { listTimeline } from '../domain/timeline/timeline';
import { fetchPriceBars } from '../domain/timeline/correlation';
import { groupEvidenceByCategory } from '../domain/reports/evidence-categories';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

function extractDescription(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null;
  if (Array.isArray(profile) && profile[0] && typeof profile[0] === 'object') {
    const row = profile[0] as Record<string, unknown>;
    return typeof row.description === 'string' ? row.description : null;
  }
  const row = profile as Record<string, unknown>;
  return typeof row.description === 'string' ? row.description : null;
}

const config: Listener = {
  event: 'viewCompany',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const ticker = asString(payload.ticker).trim().toUpperCase();
    const historyLimit = Number(payload.historyLimit) || 30;
    const from = asString(payload.from) || undefined;
    const to = asString(payload.to) || undefined;

    if (!ticker) {
      reply(ws, {
        event: 'viewCompany',
        ok: false,
        error: 'ticker is required',
      });
      return;
    }

    try {
      const { data: body, cache } = await withWsCache({
        event: 'viewCompany',
        payload,
        keyParts: {
          ticker,
          historyLimit,
          from: from ?? '',
          to: to ?? '',
        },
        policyContext: { ticker },
        fetch: async () => {
          let company = await watchlist.getByTicker(ticker);

          if (!company) {
            const search = await searchCompany(ticker, {
              addToWatchlist: true,
              ticker,
            });

            if (!search.company) {
              throw new Error(search.message ?? `company not found: ${ticker}`);
            }

            company = await watchlist.getByTicker(ticker);
          }

          if (!company) {
            throw new Error(`company not found: ${ticker}`);
          }

          const [history, delta, reports, marketTimeline] = await Promise.all([
            snapshots.getHistory(company.id, historyLimit),
            snapshots.getSnapshotDelta(company.id),
            getByTicker(ticker, 15),
            listTimeline({ ticker, limit: 50, order: 'asc' }),
          ]);

          let description: string | null = null;
          try {
            const profile = await fmpProfile(ticker, { bypassCache: true });
            description = extractDescription(profile);
          } catch (error) {
      logError(error, { source: 'listeners/view-company.ts - viewCompany' });
            description = null;
          }

          const snapshotTimeline = history
            .slice()
            .reverse()
            .map((snap) => ({
              type: 'monitoring_snapshot' as const,
              at: snap.snapshotAt,
              riskScore: snap.riskScore,
              sentimentScore: snap.sentimentScore,
              growthScore: snap.growthScore,
              confidence: snap.confidence,
              recommendation: snap.recommendation,
              marketCap: snap.marketCap,
              deltaRisk: snap.deltaRisk,
              deltaSentiment: snap.deltaSentiment,
            }));

          const latest = delta.today;

          let priceSeries: Awaited<ReturnType<typeof fetchPriceBars>> | undefined;
          if (from && to) {
            priceSeries = await fetchPriceBars(ticker, new Date(from), new Date(to), {
              bypassCache: true,
            });
          }

          const evidenceByCategory = groupEvidenceByCategory(reports);

          return {
            company: {
              ...company,
              description,
              status: {
                watchPriority: company.watchPriority,
                active: company.status === 'active',
                lastReviewed: company.lastReviewed,
                nextScanAt: company.nextScanAt,
                recommendation: latest?.recommendation ?? null,
                riskScore: latest?.riskScore ?? null,
                sentimentScore: latest?.sentimentScore ?? null,
                growthScore: latest?.growthScore ?? null,
                confidence: latest?.confidence ?? company.confidence,
              },
            },
            timeline: snapshotTimeline,
            marketTimeline,
            delta,
            reports: reports.map((r) => ({
              ...r,
              widgets: r.widgets?.length ? r.widgets : undefined,
            })),
            widgets: reports[0]?.widgets?.length ? reports[0].widgets : undefined,
            priceSeries,
            evidenceByCategory,
          };
        },
      });

      reply(ws, {
        event: 'viewCompany',
        ok: true,
        ...body,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-company.ts - viewCompany' });
      reply(ws, {
        event: 'viewCompany',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load company',
      });
    }
  },
};

export default config;
