import type { InvestmentReport } from './definitions/types';
import type { UserConfig } from '../auth/config';

export function buildConfigContext(config: UserConfig): string {
  return JSON.stringify(
    {
      conservation_percentage: config.conservationPercentage,
      risk_percentage: config.riskPercentage,
      preferred_sectors: config.preferredSectors,
      excluded_sectors: config.excludedSectors,
      max_volatility: config.maxVolatility,
      crypto_exposure_limit: config.cryptoExposureLimit,
      commodity_exposure_limit: config.commodityExposureLimit,
      international_exposure_limit: config.internationalExposureLimit,
      time_horizon: config.timeHorizon,
      min_confidence_score: config.minConfidenceScore,
      allow_ipo_recommendations: config.allowIPORecommendations,
      allow_emerging_markets: config.allowEmergingMarkets,
    },
    null,
    2
  );
}

export function buildRiskAssessmentMap(
  riskResults: Array<{
    risk: { companyAssessments?: Array<{ company: string; recommendation: string; reasons: string[] }> } | null;
  }>
): Map<string, { recommendation: string; reasons: string[] }> {
  const map = new Map<string, { recommendation: string; reasons: string[] }>();

  for (const risk of riskResults) {
    for (const assessment of risk.risk?.companyAssessments ?? []) {
      const key = assessment.company.toLowerCase();
      const existing = map.get(key);

      if (
        !existing ||
        assessment.recommendation === 'reject' ||
        (assessment.recommendation === 'restrict' && existing.recommendation === 'approve')
      ) {
        map.set(key, {
          recommendation: assessment.recommendation,
          reasons: assessment.reasons,
        });
      }
    }
  }

  return map;
}

export function applyUserPolicy(
  reports: InvestmentReport[],
  config: UserConfig,
  riskResults: Array<{
    risk: { companyAssessments?: Array<{ company: string; recommendation: string; reasons: string[] }> } | null;
  }>
): InvestmentReport[] {
  const riskMap = buildRiskAssessmentMap(riskResults);

  return reports.map((report) => {
    let approved = report.approved !== false;
    let restriction_reason = report.restriction_reason;

    if (report.confidence < config.minConfidenceScore) {
      approved = false;
      restriction_reason = `Below min confidence score (${config.minConfidenceScore})`;
    }

    if (
      config.excludedSectors.some(
        (sector) =>
          report.industry.toLowerCase().includes(sector.toLowerCase()) ||
          report.statistics?.sector === sector
      )
    ) {
      approved = false;
      restriction_reason = `Excluded sector: ${report.industry}`;
    }

    if (report.risk_score > config.maxVolatility) {
      approved = false;
      restriction_reason = `Exceeds max volatility (${config.maxVolatility})`;
    }

    if (report.risk_score > config.riskPercentage + 20) {
      approved = false;
      restriction_reason = `Exceeds user risk tolerance (${config.riskPercentage})`;
    }

    if (report.statistics?.isIPO === true && !config.allowIPORecommendations) {
      approved = false;
      restriction_reason = 'IPO recommendations disabled in user config';
    }

    if (
      report.statistics?.isEmergingMarket === true &&
      !config.allowEmergingMarkets
    ) {
      approved = false;
      restriction_reason = 'Emerging market recommendations disabled';
    }

    if (report.statistics?.isCrypto === true) {
      const cryptoScore = Number(report.statistics?.cryptoExposure ?? 100);
      if (cryptoScore > config.cryptoExposureLimit) {
        approved = false;
        restriction_reason = `Exceeds crypto exposure limit (${config.cryptoExposureLimit})`;
      }
    }

    const riskAssessment = riskMap.get(report.company.toLowerCase());

    if (riskAssessment?.recommendation === 'reject') {
      approved = false;
      restriction_reason = riskAssessment.reasons.join('; ');
    } else if (riskAssessment?.recommendation === 'restrict') {
      approved = false;
      restriction_reason = riskAssessment.reasons.join('; ');
    }

    if (
      config.preferredSectors.length > 0 &&
      !config.preferredSectors.some((sector) =>
        report.industry.toLowerCase().includes(sector.toLowerCase())
      )
    ) {
      report = {
        ...report,
        confidence: Math.max(0, report.confidence - 10),
      };
    }

    return { ...report, approved, restriction_reason };
  });
}

export function getSystemAccountId(): string {
  return (
    process.env.SYSTEM_ACCOUNT_ID ??
    '00000000-0000-0000-0000-000000000001'
  );
}
