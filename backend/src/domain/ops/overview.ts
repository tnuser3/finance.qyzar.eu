import * as watchlist from '../watchlist/watchlist';
import * as snapshots from '../watchlist/snapshots';
import * as pipelineRuns from './pipeline-runs';
import { listRecent } from '../../agents/reports';
import { listCorrelations } from '../timeline/correlation';
import type { MarketCorrelationRecord } from '../../agents/definitions/types';

export interface OverviewMetrics {
  totalCompanies: number;
  byPriority: { p1: number; p2: number; p3: number };
  byRecommendation: Record<string, number>;
  averages: {
    confidence: number | null;
    riskScore: number | null;
    sentimentScore: number | null;
    growthScore: number | null;
  };
  marketRating: {
    score: number;
    label: string;
  };
  topMovers: Array<{
    ticker: string;
    name: string;
    deltaRisk: number | null;
    deltaSentiment: number | null;
    recommendation: string;
  }>;
  recentEvidence: Array<{
    ticker: string;
    company: string;
    source: string;
    finding: string;
    at: string;
  }>;
  lastRuns: {
    discovery: Awaited<ReturnType<typeof pipelineRuns.getLatestByWorkflow>>[0] | null;
    monitoring: Awaited<ReturnType<typeof pipelineRuns.getLatestByWorkflow>>[0] | null;
    correlation: Awaited<ReturnType<typeof pipelineRuns.getLatestByWorkflow>>[0] | null;
  };
  recentCorrelations: MarketCorrelationRecord[];
}

function ratingLabel(score: number): string {
  if (score >= 75) return 'Bullish';
  if (score >= 55) return 'Neutral';
  if (score >= 35) return 'Cautious';
  return 'Bearish';
}

export async function buildOverview(): Promise<OverviewMetrics> {
  const companies = await watchlist.listActive(500);

  let confidenceSum = 0;
  let confidenceCount = 0;
  let riskSum = 0;
  let riskCount = 0;
  let sentimentSum = 0;
  let sentimentCount = 0;
  let growthSum = 0;
  let growthCount = 0;

  const byRecommendation: Record<string, number> = {};
  const movers: OverviewMetrics['topMovers'] = [];

  for (const company of companies) {
    const delta = await snapshots.getSnapshotDelta(company.id);
    const snap = delta.today;

    if (snap) {
      confidenceSum += snap.confidence;
      confidenceCount++;
      riskSum += snap.riskScore;
      riskCount++;

      if (snap.sentimentScore != null) {
        sentimentSum += snap.sentimentScore;
        sentimentCount++;
      }

      if (snap.growthScore != null) {
        growthSum += snap.growthScore;
        growthCount++;
      }

      const rec = snap.recommendation;
      byRecommendation[rec] = (byRecommendation[rec] ?? 0) + 1;

      movers.push({
        ticker: company.ticker,
        name: company.name,
        deltaRisk: delta.deltaRisk,
        deltaSentiment: delta.deltaSentiment,
        recommendation: rec,
      });
    }
  }

  movers.sort((a, b) => {
    const aMag = Math.abs(a.deltaRisk ?? 0) + Math.abs(a.deltaSentiment ?? 0);
    const bMag = Math.abs(b.deltaRisk ?? 0) + Math.abs(b.deltaSentiment ?? 0);
    return bMag - aMag;
  });

  const avgConfidence =
    confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : null;
  const avgRisk = riskCount > 0 ? Math.round(riskSum / riskCount) : null;
  const avgSentiment =
    sentimentCount > 0 ? Math.round(sentimentSum / sentimentCount) : null;
  const avgGrowth =
    growthCount > 0 ? Math.round(growthSum / growthCount) : null;

  const buyCount =
    (byRecommendation['BUY'] ?? 0) + (byRecommendation['STRONG_BUY'] ?? 0);
  const sellCount =
    (byRecommendation['SELL'] ?? 0) + (byRecommendation['STRONG_SELL'] ?? 0);
  const holdCount = byRecommendation['HOLD'] ?? 0;
  const totalRated = buyCount + sellCount + holdCount;

  let marketScore = 50;
  if (totalRated > 0) {
    marketScore = Math.round(
      ((buyCount * 80 + holdCount * 50 + sellCount * 20) / totalRated) * 0.4 +
        (avgConfidence ?? 50) * 0.3 +
        (100 - (avgRisk ?? 50)) * 0.2 +
        (avgSentiment ?? 50) * 0.1
    );
  } else if (avgConfidence != null) {
    marketScore = Math.round(avgConfidence * 0.6 + (100 - (avgRisk ?? 50)) * 0.4);
  }

  const recentReports = await listRecent(30);
  const recentEvidence: OverviewMetrics['recentEvidence'] = [];

  for (const report of recentReports) {
    for (const item of report.evidence.slice(0, 2)) {
      recentEvidence.push({
        ticker: report.ticker,
        company: report.company,
        source: item.agent,
        finding: item.finding,
        at: report.createdAt,
      });

      if (recentEvidence.length >= 20) break;
    }

    if (recentEvidence.length >= 20) break;
  }

  const [discoveryRuns, monitoringRuns, correlationRuns, recentCorrelations] =
    await Promise.all([
      pipelineRuns.getLatestByWorkflow('discovery', 1),
      pipelineRuns.getLatestByWorkflow('monitoring', 1),
      pipelineRuns.getLatestByWorkflow('correlation', 1),
      listCorrelations({ limit: 5 }),
    ]);

  return {
    totalCompanies: companies.length,
    byPriority: {
      p1: companies.filter((c) => c.watchPriority === 1).length,
      p2: companies.filter((c) => c.watchPriority === 2).length,
      p3: companies.filter((c) => c.watchPriority === 3).length,
    },
    byRecommendation,
    averages: {
      confidence: avgConfidence,
      riskScore: avgRisk,
      sentimentScore: avgSentiment,
      growthScore: avgGrowth,
    },
    marketRating: {
      score: marketScore,
      label: ratingLabel(marketScore),
    },
    topMovers: movers.slice(0, 10),
    recentEvidence,
    lastRuns: {
      discovery: discoveryRuns[0] ?? null,
      monitoring: monitoringRuns[0] ?? null,
      correlation: correlationRuns[0] ?? null,
    },
    recentCorrelations,
  };
}
