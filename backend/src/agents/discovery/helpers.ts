import type { DiscoveryOpportunity } from '../definitions/types';


export function isEnglishText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !/[^\x20-\x7E\n\r\t]/.test(trimmed);
}

export function isEnglishLanguageTag(tag: string | undefined): boolean {
  if (!tag?.trim()) return true;
  const lower = tag.trim().toLowerCase();
  return lower === 'en' || lower.startsWith('en-') || lower === 'english';
}

export function englishOnlyJoin(parts: Array<string | undefined>): string {
  return parts.filter((part) => part && isEnglishText(part)).join(' ');
}

export function filterEnglishOpportunity<T extends DiscoveryOpportunity>(
  opp: T
): T | null {
  const fields = [
    opp.title,
    opp.description,
    opp.company,
    opp.industry,
    opp.summary as string | undefined,
  ].filter(Boolean) as string[];

  for (const field of fields) {
    if (!isEnglishText(field)) return null;
  }

  const evidence = (opp.evidence ?? []).filter(
    (row) =>
      isEnglishText(row.summary) &&
      isEnglishText(row.reason) &&
      isEnglishText(row.rawData)
  );

  if (evidence.length === 0) return null;

  return { ...opp, evidence };
}

export function filterEnglishOpportunities<T extends DiscoveryOpportunity>(
  opportunities: T[]
): T[] {
  return opportunities
    .map((opp) => filterEnglishOpportunity(opp))
    .filter((opp): opp is T => opp !== null);
}


export function filterEnglishNewsRows(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data
      .map((item) => filterEnglishNewsRows(item))
      .filter((item) => item !== null);
  }

  if (!data || typeof data !== 'object') return data;

  const record = data as Record<string, unknown>;
  const title = String(record.title ?? record.name ?? '').trim();
  const language = String(record.language ?? record.sourcelang ?? '').trim();
  const description = String(record.description ?? record.summary ?? '').trim();

  if (title || description) {
    if (!isEnglishLanguageTag(language)) return null;
    if (title && !isEnglishText(title)) return null;
    if (description && !isEnglishText(description)) return null;
  }

  const filtered: Record<string, unknown> = { ...record };

  for (const key of ['news', 'articles', 'results', 'items'] as const) {
    if (Array.isArray(record[key])) {
      filtered[key] = filterEnglishNewsRows(record[key]);
    }
  }

  if (Array.isArray(record.hits)) {
    filtered.hits = (record.hits as unknown[])
      .map((hit) => {
        if (!hit || typeof hit !== 'object') return hit;
        const hitRecord = hit as Record<string, unknown>;
        const source = (hitRecord._source as Record<string, unknown> | undefined) ?? hitRecord;
        const filingTitle = String(source.display_names ?? source.entity_name ?? '').trim();
        if (filingTitle && !isEnglishText(filingTitle)) return null;
        return hit;
      })
      .filter(Boolean);
  }

  return filtered;
}

import type { NormalizedOpportunity, ValidationAssessment } from '../definitions/types';

export interface OpportunityScores {
  confidence: number;
  risk_score: number;
  titanScore: number;
}

const PREMIUM_TICKERS = new Set([
  'XOM',
  'COIN',
  'NVDA',
  'MSFT',
  'AAPL',
  'MSTR',
  'SMR',
  'NEE',
  'GOOGL',
  'META',
]);

const SOURCE_QUALITY: Record<string, number> = {
  edgar: 12,
  fmp: 12,
  finnhub: 10,
  coingecko: 9,
  gdelt: 6,
  guardian: 7,
  currentsapi: 6,
  fred: 5,
  rss: 6,
  reddit: 4,
  googletrends: 7,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isGarbageOpportunity(opp: DiscoveryOpportunity): boolean {
  const blob = `${opp.title} ${opp.company} ${opp.description}`.toLowerCase();
  if (!isEnglishText(opp.title) || !isEnglishText(opp.description) || !isEnglishText(opp.company)) {
    return true;
  }
  return (
    blob.includes('list_commands') ||
    blob.includes('list_com') ||
    opp.title.includes('...') ||
    opp.company.includes('...') ||
    /^\s*\[_/.test(opp.title)
  );
}

function isMacroNoiseWithoutEquity(opp: DiscoveryOpportunity): boolean {
  if (opp.ticker?.trim()) return false;
  const text = `${opp.title} ${opp.description}`.toLowerCase();
  return (
    /public input|policy framework|ordinary europeans|geopolit|anti-russia|consultation/.test(
      text
    ) && opp.listingStatus !== 'listed'
  );
}

export function computeOpportunityScores(opp: DiscoveryOpportunity): OpportunityScores {
  if (isGarbageOpportunity(opp)) {
    return { confidence: 28, risk_score: 78, titanScore: 22 };
  }

  let confidence = 38;
  let risk_score = 50;
  let titanScore = 34;

  const evidenceCount = opp.evidence?.length ?? 0;
  const agentCount = opp.discoveredBy?.length ?? (opp.agentId ? 1 : 0);
  const text = `${opp.title} ${opp.description}`.toLowerCase();

  if (opp.ticker?.trim()) {
    const ticker = opp.ticker.trim().toUpperCase();
    confidence += 14;
    titanScore += 16;
    risk_score -= 8;

    if (PREMIUM_TICKERS.has(ticker)) {
      titanScore += 20;
      confidence += 12;
      risk_score -= 10;
    }
  } else if (opp.listingStatus === 'emerging' || opp.listingStatus === 'pre_ipo') {
    confidence -= 6;
    risk_score += 16;
    titanScore -= 8;
  }

  confidence += Math.min(20, evidenceCount * 7);
  titanScore += Math.min(18, evidenceCount * 5);
  risk_score -= Math.min(15, evidenceCount * 4);

  confidence += Math.min(14, Math.max(0, agentCount - 1) * 7);
  titanScore += Math.min(16, Math.max(0, agentCount - 1) * 8);
  risk_score -= Math.min(12, Math.max(0, agentCount - 1) * 5);

  for (const ev of opp.evidence ?? []) {
    const prefix = ev.source.toLowerCase().split(/[._]/)[0] ?? ev.source;
    const quality = SOURCE_QUALITY[prefix] ?? 3;
    confidence += quality * 0.45;
    titanScore += quality * 0.35;
    risk_score -= quality * 0.15;
  }

  if (opp.description.length > 80) confidence += 4;
  if (opp.description.length > 160) {
    confidence += 4;
    titanScore += 3;
  }

  if (/ipo|institutional|etf|leader|surge|billionaire|market cap|semiconductor|nuclear|utility/.test(text)) {
    titanScore += 10;
    confidence += 6;
  }

  if (/enforcement|investigation|bankruptcy|scandal|sanction/.test(text)) {
    risk_score += 12;
    titanScore -= 6;
  }

  if (isMacroNoiseWithoutEquity(opp)) {
    confidence -= 12;
    risk_score += 18;
    titanScore -= 15;
  }

  if (opp.industry && opp.industry !== 'Unknown') {
    confidence += 4;
    titanScore += 3;
  }

  const agentProvided =
    opp.confidence !== 55 || opp.risk_score !== 50 || opp.titanScore !== 52;

  if (agentProvided) {
    return {
      confidence: clamp(opp.confidence * 0.35 + confidence * 0.65, 25, 92),
      risk_score: clamp(opp.risk_score * 0.35 + risk_score * 0.65, 15, 88),
      titanScore: clamp(opp.titanScore * 0.35 + titanScore * 0.65, 20, 90),
    };
  }

  return {
    confidence: clamp(confidence, 25, 92),
    risk_score: clamp(risk_score, 15, 88),
    titanScore: clamp(titanScore, 20, 90),
  };
}

export function withComputedScores<T extends DiscoveryOpportunity>(opp: T): T {
  const scores = computeOpportunityScores(opp);
  return { ...opp, ...scores };
}

export function applyValidationScores(
  candidate: NormalizedOpportunity,
  assessments: ValidationAssessment[]
): NormalizedOpportunity {
  const matched = assessments.filter(
    (row) =>
      (row.ticker && candidate.ticker?.toUpperCase() === row.ticker.toUpperCase()) ||
      row.company.toLowerCase() === candidate.company.toLowerCase()
  );

  if (matched.length === 0) {
    return withComputedScores(candidate);
  }

  const avgRisk =
    matched.reduce((sum, row) => sum + row.risk_score, 0) / matched.length;
  const rejectCount = matched.filter((row) => row.recommendation === 'reject').length;
  const restrictCount = matched.filter((row) => row.recommendation === 'restrict').length;
  const approveCount = matched.filter((row) => row.recommendation === 'approve').length;

  let confidence = candidate.confidence;
  let risk_score = Math.round((candidate.risk_score * 0.55 + avgRisk * 0.45));
  let titanScore = candidate.titanScore;

  if (approveCount > rejectCount) {
    confidence += 6;
    titanScore += 4;
    risk_score -= 4;
  }
  if (restrictCount > 0) {
    confidence -= 4;
    risk_score += 6;
  }
  if (rejectCount > 0) {
    confidence -= 8;
    risk_score += 10;
    titanScore -= 6;
  }

  return withComputedScores({
    ...candidate,
    confidence: clamp(confidence, 25, 92),
    risk_score: clamp(risk_score, 15, 88),
    titanScore: clamp(titanScore, 20, 90),
  });
}
