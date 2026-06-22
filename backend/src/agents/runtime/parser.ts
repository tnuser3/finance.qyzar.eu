import type {
  EvidenceItem,
  EvidenceWidget,
  InvestmentReport,
  ListingStatus,
  DiscoveryOpportunity,
  DiscoveryOpportunityEvidence,
  Recommendation,
  RiskAssessment,
  WidgetType,
} from '../definitions/types';
import { filterEnglishOpportunities, isEnglishText } from '../discovery/helpers';
import { logError } from '../../infra/db/error-log';

const AGENT_OUTPUT_PATTERN =
  /<agent_output>\s*([\s\S]*?)\s*<\/agent_output>/i;

const SPAWN_SUBAGENT_PATTERN =
  /<spawn_subagent>\s*([\s\S]*?)\s*<\/spawn_subagent>/gi;

export interface ParsedSubagentSpawn {
  label: string;
  prompt: string;
}

export function parseSubagentSpawns(text: string): ParsedSubagentSpawn[] {
  const spawns: ParsedSubagentSpawn[] = [];
  const pattern = new RegExp(
    SPAWN_SUBAGENT_PATTERN.source,
    SPAWN_SUBAGENT_PATTERN.flags
  );

  for (const match of text.matchAll(pattern)) {
    const raw = match[1]?.trim();

    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ParsedSubagentSpawn>;

      if (!parsed.label || !parsed.prompt) {
        continue;
      }

      spawns.push({ label: parsed.label, prompt: parsed.prompt });
    } catch (error) {
      logError(error, { source: 'agents/parser.ts - parseSubagentSpawns' });
      continue;
    }
  }

  return spawns;
}

export function parseAgentOutput<T = Record<string, unknown>>(
  text: string
): T | null {
  const match = text.match(AGENT_OUTPUT_PATTERN);

  if (match?.[1]) {
    try {
      return JSON.parse(match[1]) as T;
    } catch (error) {
      logError(error, { source: 'agents/parser.ts - parseSubagentSpawns' });

    }
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as T;
    } catch (error) {
      logError(error, { source: 'agents/parser.ts - parseSubagentSpawns' });

    }
  }

  const objectMatch = text.match(/\{[\s\S]*"(?:findings|companies|reports|opportunities)"[\s\S]*\}/);

  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]) as T;
    } catch (error) {
      logError(error, { source: 'agents/parser.ts - parseSubagentSpawns' });
      return null;
    }
  }

  return null;
}

function normalizeRecommendation(value: unknown): Recommendation {
  const rec = String(value ?? 'HOLD').toUpperCase();

  if (rec === 'BUY' || rec === 'HOLD' || rec === 'SELL' || rec === 'AVOID') {
    return rec;
  }

  return 'HOLD';
}

function normalizeEvidence(raw: unknown): EvidenceItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (typeof item === 'object' && item !== null && 'finding' in item) {
        const record = item as Record<string, unknown>;
        return {
          agent: String(record.agent ?? 'unknown'),
          finding: String(record.finding ?? record.description ?? ''),
        };
      }

      if (typeof item === 'string') {
        return { agent: 'unknown', finding: item };
      }

      return null;
    })
    .filter((item): item is EvidenceItem => item !== null && item.finding.length > 0);
}

export function extractRecommendations(text: string): Array<{
  company: string;
  ticker: string;
  recommendation: Recommendation;
  confidence: number;
  thesis: string;
  agents: string[];
}> {
  const parsed = parseAgentOutput<{
    recommendations?: Array<Record<string, unknown>>;
  }>(text);

  if (!parsed?.recommendations?.length) {
    return [];
  }

  return parsed.recommendations.map((rec) => ({
    company: String(rec.company ?? 'Unknown'),
    ticker: String(rec.ticker ?? 'N/A'),
    recommendation: normalizeRecommendation(rec.recommendation),
    confidence: Math.min(100, Math.max(0, Number(rec.confidence ?? 0))),
    thesis: String(rec.thesis ?? rec.summary ?? ''),
    agents: Array.isArray(rec.agents) ? rec.agents.map(String) : [],
  }));
}

export function extractInvestmentReports(
  text: string,
  defaultHorizon = '12 months'
): InvestmentReport[] {
  const parsed = parseAgentOutput<{
    reports?: Partial<InvestmentReport>[];
    findings?: Array<Record<string, unknown>>;
  }>(text);

  if (!parsed) {
    return [];
  }

  const rawReports = parsed.reports ?? [];

  if (rawReports.length > 0) {
    return rawReports.map((report) => ({
      company: String(report.company ?? 'Unknown'),
      ticker: String(report.ticker ?? 'N/A'),
      industry: String(report.industry ?? 'Unknown'),
      recommendation: normalizeRecommendation(report.recommendation),
      confidence: Math.min(100, Math.max(0, Number(report.confidence ?? 0))),
      risk_score: Math.min(100, Math.max(0, Number(report.risk_score ?? 50))),
      agents: Array.isArray(report.agents)
        ? report.agents.map(String)
        : [],
      evidence: normalizeEvidence(report.evidence),
      statistics:
        report.statistics && typeof report.statistics === 'object'
          ? (report.statistics as Record<string, unknown>)
          : {},
      widgets: normalizeWidgets(report.widgets),
      time_horizon: String(report.time_horizon ?? defaultHorizon),
      generated_at: String(report.generated_at ?? new Date().toISOString()),
      approved: report.approved !== false,
      restriction_reason: report.restriction_reason
        ? String(report.restriction_reason)
        : undefined,
    }));
  }

  if (parsed.findings?.length) {
    return parsed.findings.map((finding) => ({
      company: String(finding.company ?? 'Unknown'),
      ticker: String(finding.ticker ?? 'N/A'),
      industry: String(finding.industry ?? 'Unknown'),
      recommendation: 'HOLD' as Recommendation,
      confidence: Math.min(100, Math.max(0, Number(finding.confidence ?? 50))),
      risk_score: Math.min(100, Math.max(0, Number(finding.risk_score ?? 50))),
      agents: [String(finding.agent ?? 'discovery')],
      evidence: normalizeEvidence(finding.evidence),
      statistics:
        finding.stats && typeof finding.stats === 'object'
          ? (finding.stats as Record<string, unknown>)
          : {},
      time_horizon: defaultHorizon,
      generated_at: new Date().toISOString(),
      approved: finding.approved !== false,
    }));
  }

  return [];
}

export function extractRiskAssessment(
  text: string,
  agentId: string
): RiskAssessment | null {
  const parsed = parseAgentOutput<RiskAssessment>(text);

  if (!parsed) {
    return null;
  }

  return {
    agent: agentId,
    summary: parsed.summary ?? '',
    safetyNets: parsed.safetyNets ?? [],
    restrictions: parsed.restrictions ?? [],
    companyAssessments: parsed.companyAssessments ?? [],
  };
}

export function stripAgentBlocks(text: string): string {
  return text
    .replace(AGENT_OUTPUT_PATTERN, '')
    .replace(SPAWN_SUBAGENT_PATTERN, '')
    .trim();
}


export function extractFindings(text: string, agentId: string) {
  return extractInvestmentReports(text).map((report) => ({
    company: report.company,
    type: report.recommendation,
    agent: agentId,
    industry: report.industry,
    title: `${report.company} ${report.recommendation}`,
    description: report.evidence.map((e) => e.finding).join('; '),
    evidence: report.evidence,
    stats: report.statistics,
    approved: report.approved,
    restrictionReason: report.restriction_reason,
  }));
}

export function extractDiscoveryOutput(text: string): {
  newOpportunities: string[];
  companies: Array<{
    ticker: string;
    name: string;
    industry: string;
    confidence: number;
  }>;
  summary: string;
} {
  const structured = extractDiscoveryOpportunities(text);
  if (structured.opportunities.length > 0) {
    return {
      newOpportunities: [...new Set(structured.opportunities.map((o) => o.industry))],
      companies: structured.opportunities
        .filter((o) => o.ticker)
        .map((o) => ({
          ticker: o.ticker!,
          name: o.company,
          industry: o.industry,
          confidence: o.confidence,
        })),
      summary: structured.summary,
    };
  }

  const parsed = parseAgentOutput<{
    new_opportunities?: string[];
    companies?: Array<Record<string, unknown>>;
    findings?: Array<Record<string, unknown>>;
    summary?: string;
  }>(text);

  if (!parsed) {
    return { newOpportunities: [], companies: [], summary: '' };
  }

  const companies = (parsed.companies ?? parsed.findings ?? []).map((c) => {
    const rawTicker = String(c.ticker ?? c.symbol ?? '').trim().toUpperCase();
    const companyName = String(c.company ?? c.name ?? 'Unknown');
    const stats =
      c.stats && typeof c.stats === 'object'
        ? (c.stats as Record<string, unknown>)
        : {};
    const inferredTicker =
      rawTicker && rawTicker !== 'N/A'
        ? rawTicker
        : /^[A-Z]{1,5}$/.test(companyName.trim().toUpperCase())
          ? companyName.trim().toUpperCase()
          : 'N/A';
    const industry = String(
      c.industry ??
        c.sector ??
        stats.industry ??
        stats.sector ??
        (Array.isArray(stats.beneficiarySectors) ? stats.beneficiarySectors[0] : '') ??
        'Unknown'
    ).trim();

    return {
      ticker: inferredTicker,
      name: companyName,
      industry: industry || 'Unknown',
      confidence: Math.min(100, Math.max(0, Number(c.confidence ?? 50))),
    };
  });

  return {
    newOpportunities: parsed.new_opportunities ?? [],
    companies: companies.filter((c) => c.ticker !== 'N/A'),
    summary: String(parsed.summary ?? ''),
  };
}

const GENERIC_PHRASES = [
  'found in tool results',
  'evidence_fallback',
  'inferred from tool evidence',
  'mentioned in seeded research',
  'fallback synthesis',
];

function isGenericDiscoveryText(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
}

function normalizeListingStatus(value: unknown): ListingStatus {
  const status = String(value ?? 'listed').toLowerCase();
  if (status === 'emerging' || status === 'pre_ipo' || status === 'foreign') {
    return status;
  }
  return 'listed';
}

function normalizeOpportunityEvidence(raw: unknown): DiscoveryOpportunityEvidence[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const summary = String(record.summary ?? record.finding ?? '').trim();
      const reason = String(record.reason ?? '').trim();
      const rawData = String(record.rawData ?? record.raw_data ?? record.finding ?? '').trim();
      const source = String(record.source ?? record.agent ?? 'research').trim();

      if (!summary && !reason && !rawData) return null;
      if (isGenericDiscoveryText(`${summary} ${reason} ${rawData}`)) return null;

      return {
        source,
        rawData: rawData || summary,
        reason: reason || 'Supports investment thesis',
        summary: summary || reason.slice(0, 120),
      };
    })
    .filter((item): item is DiscoveryOpportunityEvidence => item !== null);
}

function legacyToOpportunity(
  record: Record<string, unknown>,
  agentId?: string
): DiscoveryOpportunity | null {
  const company = String(record.company ?? record.name ?? '').trim();
  const title = String(record.title ?? `${company} opportunity`).trim();
  const description = String(record.description ?? record.thesis ?? '').trim();
  const rawTicker = String(record.ticker ?? record.symbol ?? '').trim().toUpperCase();
  const ticker =
    rawTicker && rawTicker !== 'N/A'
      ? rawTicker
      : /^[A-Z]{1,5}$/.test(company.toUpperCase())
        ? company.toUpperCase()
        : undefined;

  const evidenceFromNews = Array.isArray(record.newsEvents)
    ? (record.newsEvents as Array<Record<string, unknown>>).map((event) => ({
        source: String(event.source ?? 'news'),
        rawData: String(event.title ?? ''),
        reason: 'News event supports thesis',
        summary: String(event.title ?? '').slice(0, 120),
      }))
    : [];

  const evidence = [
    ...normalizeOpportunityEvidence(record.evidence),
    ...evidenceFromNews,
  ];

  const companyName = company || title.slice(0, 80);
  const descriptionText =
    description ||
    (evidence.length > 0
      ? `${companyName}: ${evidence.map((e) => e.summary).join(' ')}`.slice(0, 500)
      : '');

  if (!companyName || evidence.length === 0 || descriptionText.length < 30) return null;

  const stats =
    record.stats && typeof record.stats === 'object'
      ? (record.stats as Record<string, unknown>)
      : {};

  if (isGenericDiscoveryText(`${title} ${descriptionText}`)) return null;
  if (!isEnglishText(title) || !isEnglishText(descriptionText)) return null;
  if (companyName && !isEnglishText(companyName)) return null;

  return {
    title,
    description: descriptionText,
    ticker,
    company: companyName,
    industry: String(record.industry ?? stats.industry ?? 'Unknown'),
    listingStatus: normalizeListingStatus(record.listingStatus ?? record.listing_status),
    confidence: Math.min(100, Math.max(0, Number(record.confidence ?? 50))),
    risk_score: Math.min(100, Math.max(0, Number(record.risk_score ?? stats.risk_score ?? 50))),
    titanScore: Math.min(100, Math.max(0, Number(record.titanScore ?? stats.titanScore ?? 50))),
    evidence,
    agentId,
  };
}

export function extractDiscoveryOpportunities(
  text: string,
  agentId?: string
): {
  opportunities: DiscoveryOpportunity[];
  summary: string;
  shortfallNote?: string;
} {
  const parsed = parseAgentOutput<{
    opportunities?: Array<Record<string, unknown>>;
    findings?: Array<Record<string, unknown>>;
    companies?: Array<Record<string, unknown>>;
    summary?: string;
    shortfallNote?: string;
  }>(text);

  if (!parsed) {
    return { opportunities: [], summary: '' };
  }

  const rawRows =
    parsed.opportunities ??
    parsed.findings ??
    parsed.companies ??
    [];

  const opportunities = filterEnglishOpportunities(
    rawRows
      .map((row) => legacyToOpportunity(row, agentId))
      .filter((row): row is DiscoveryOpportunity => row !== null)
  );

  return {
    opportunities,
    summary: String(parsed.summary ?? ''),
    shortfallNote: parsed.shortfallNote ? String(parsed.shortfallNote) : undefined,
  };
}

export function hasValidStructuredDiscoveryOutput(text: string): boolean {
  const { opportunities } = extractDiscoveryOpportunities(text);
  return opportunities.some(
    (opp) =>
      opp.title.trim().length > 5 &&
      opp.description.trim().length > 30 &&
      opp.evidence.length >= 1 &&
      (opp.company.trim().length > 0 || Boolean(opp.ticker))
  );
}

const TICKER_BLOCKLIST = new Set([
  'A',
  'AI',
  'ALL',
  'AM',
  'AN',
  'API',
  'AS',
  'AT',
  'BE',
  'BTC',
  'CEO',
  'CPI',
  'DOJ',
  'ECB',
  'ED',
  'ET',
  'ETH',
  'EU',
  'EV',
  'FBI',
  'FDIC',
  'FED',
  'GDP',
  'GOV',
  'HR',
  'ID',
  'IF',
  'IM',
  'IN',
  'IPO',
  'IRS',
  'IT',
  'LLC',
  'LTD',
  'NASDAQ',
  'NSA',
  'NYSE',
  'OF',
  'ON',
  'OR',
  'PM',
  'PPI',
  'SEC',
  'SPAC',
  'TO',
  'UK',
  'US',
  'USD',
  'VS',
  'WTI',
]);

function extractTickersFromEvidence(evidence: string): string[] {
  const found = new Set<string>();

  const patterns = [
    /\(([A-Z]{1,5})\)/g,
    /\$([A-Z]{1,5})\b/g,
    /(?:NYSE|NASDAQ|AMEX|OTC)\s*:?\s*([A-Z]{1,5})\b/gi,
    /ticker\s*[:=]\s*"?([A-Z]{1,5})"?/gi,
    /"symbol"\s*:\s*"([A-Z]{1,5})"/gi,
    /"ticker"\s*:\s*"([A-Z]{1,5})"/gi,
    /"symbols"\s*:\s*\[\s*"([A-Z]{1,5})"/gi,
  ];

  for (const pattern of patterns) {
    for (const match of evidence.matchAll(pattern)) {
      const ticker = String(match[1] ?? '').trim().toUpperCase();
      if (ticker.length >= 2 && !TICKER_BLOCKLIST.has(ticker)) {
        found.add(ticker);
      }
    }
  }

  return Array.from(found).slice(0, 8);
}

export function isDiscoveryOutputParsed(text: string): boolean {
  return hasValidStructuredDiscoveryOutput(text);
}

export function synthesizeDiscoveryFromEvidence(
  evidence: string,
  agentId: string
): string {
  const tickers = extractTickersFromEvidence(evidence);

  if (tickers.length === 0) {
    return `<agent_output>
{
  "findings": [],
  "summary": "Tool evidence collected but no tickers could be inferred automatically."
}
</agent_output>`;
  }

  const findings = tickers.map((ticker) => ({
    company: ticker,
    ticker,
    type: 'news_signal',
    agent: agentId,
    industry: 'Unknown',
    title: `${ticker} mentioned in seeded research`,
    description: 'Inferred from tool evidence when model output was missing.',
    evidence: [{ agent: agentId, finding: `Ticker ${ticker} found in tool results.` }],
    stats: { source: 'evidence_fallback' },
  }));

  return `<agent_output>
${JSON.stringify(
    {
      findings,
      summary: `Fallback synthesis from tool evidence (${tickers.length} ticker(s)).`,
    },
    null,
    2
  )}
</agent_output>`;
}

export function extractMonitoringSignals(text: string): import('../definitions/types').MonitoringSignal | null {
  const parsed = parseAgentOutput<Record<string, unknown>>(text);

  if (!parsed?.ticker && !parsed?.company) {
    return null;
  }

  return {
    company: String(parsed.company ?? 'Unknown'),
    ticker: String(parsed.ticker ?? 'N/A'),
    risk_score: parsed.risk_score != null ? Number(parsed.risk_score) : undefined,
    sentiment_score:
      parsed.sentiment_score != null ? Number(parsed.sentiment_score) : undefined,
    growth_score: parsed.growth_score != null ? Number(parsed.growth_score) : undefined,
    severity: parsed.severity as 'low' | 'medium' | 'high' | undefined,
    signals: Array.isArray(parsed.signals)
      ? (parsed.signals as Array<{ source: string; finding: string }>)
      : [],
  };
}

const WIDGET_TYPES: WidgetType[] = [
  'line_chart',
  'bar_chart',
  'timeline',
  'list',
  'metric_grid',
  'progress',
  'comparison',
  'sparkline',
  'donut',
  'table',
  'correlation_chart',
];

function normalizeWidgets(raw: unknown): EvidenceWidget[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const record = item as Record<string, unknown>;
      const type = String(record.type ?? '');

      if (!WIDGET_TYPES.includes(type as WidgetType)) return null;

      return {
        id: String(record.id ?? `widget-${index + 1}`),
        type: type as WidgetType,
        title: String(record.title ?? 'Insight'),
        subtitle: record.subtitle ? String(record.subtitle) : undefined,
        source: record.source ? String(record.source) : undefined,
        priority: record.priority != null ? Number(record.priority) : index + 1,
        data:
          record.data && typeof record.data === 'object'
            ? (record.data as Record<string, unknown>)
            : {},
      };
    })
    .filter((w): w is EvidenceWidget => w !== null)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

export function extractEvidenceWidgets(text: string): EvidenceWidget[] {
  const parsed = parseAgentOutput<{ widgets?: unknown }>(text);

  if (!parsed?.widgets) {
    return [];
  }

  return normalizeWidgets(parsed.widgets);
}

export function validateTwoSentenceDescription(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences.length === 2;
}

function normalizeEvidenceItems(raw: unknown): EvidenceItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const finding = String(record.finding ?? record.description ?? '').trim();
      if (!finding) return null;
      return {
        agent: String(record.agent ?? record.source ?? 'unknown'),
        finding,
      };
    })
    .filter((e): e is EvidenceItem => e !== null);
}

export function extractMarketCorrelations(text: string): import('../definitions/types').MarketCorrelationCandidate[] {
  const parsed = parseAgentOutput<{
    correlations?: Array<Record<string, unknown>>;
    summary?: string;
  }>(text);

  if (!parsed?.correlations?.length) return [];

  return parsed.correlations
    .map((c) => {
      const title = String(c.title ?? '').trim();
      const description = String(c.description ?? '').trim();
      const primaryTicker = String(c.primaryTicker ?? c.ticker ?? '').trim().toUpperCase();
      const windowStart = String(c.windowStart ?? c.window_start ?? '');
      const windowEnd = String(c.windowEnd ?? c.window_end ?? '');

      if (!title || !description || !primaryTicker || !windowStart || !windowEnd) {
        return null;
      }

      const companies = Array.isArray(c.companies)
        ? c.companies
            .map((co) => {
              if (!co || typeof co !== 'object') return null;
              const row = co as Record<string, unknown>;
              return {
                ticker: String(row.ticker ?? primaryTicker).toUpperCase(),
                name: String(row.name ?? row.company ?? primaryTicker),
              };
            })
            .filter((co): co is { ticker: string; name: string } => co !== null)
        : [{ ticker: primaryTicker, name: String(c.company ?? primaryTicker) }];

      const newsEvents = Array.isArray(c.newsEvents ?? c.news_events)
        ? (c.newsEvents ?? c.news_events as Array<Record<string, unknown>>).map((e) => ({
            at: String(e.at ?? e.date ?? windowStart),
            title: String(e.title ?? ''),
            source: String(e.source ?? 'news'),
            url: e.url ? String(e.url) : undefined,
          }))
        : [];

      return {
        title,
        description,
        windowStart,
        windowEnd,
        primaryTicker,
        companies,
        evidence: normalizeEvidenceItems(c.evidence),
        newsEvents,
        confidence: c.confidence != null ? Number(c.confidence) : 50,
      };
    })
    .filter((c): c is import('../definitions/types').MarketCorrelationCandidate => c !== null);
}

export function extractWatchlistReviews(
  text: string
): import('../definitions/types').WatchlistReviewCandidate[] {
  const parsed = parseAgentOutput<{
    reviews?: Array<Record<string, unknown>>;
  }>(text);

  if (!parsed?.reviews?.length) return [];

  return parsed.reviews
    .map((review) => {
      const ticker = String(review.ticker ?? '').trim().toUpperCase();
      const name = String(review.name ?? review.company ?? ticker).trim();
      const headline = String(review.headline ?? review.title ?? '').trim();
      const summary = String(review.summary ?? review.description ?? '').trim();
      const sentiment = String(review.sentiment ?? 'neutral').trim();

      if (!ticker || !headline || !summary) {
        return null;
      }

      const newsHighlights = Array.isArray(review.newsHighlights)
        ? review.newsHighlights
            .map((item) => {
              if (!item || typeof item !== 'object') return null;
              const row = item as Record<string, unknown>;
              const title = String(row.title ?? '').trim();
              if (!title) return null;
              return {
                at: String(row.at ?? row.publishedAt ?? ''),
                title,
                source: String(row.source ?? 'news'),
                url: row.url ? String(row.url) : undefined,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : [];

      return {
        ticker,
        name,
        headline,
        summary,
        sentiment,
        confidence: review.confidence != null ? Number(review.confidence) : 60,
        newsHighlights,
        evidence: normalizeEvidenceItems(review.evidence),
      };
    })
    .filter(
      (review): review is import('../definitions/types').WatchlistReviewCandidate =>
        review !== null
    );
}
