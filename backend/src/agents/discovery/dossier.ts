import { callDeepAI } from '../../providers/ai/deepai';
import type { DiscoveryAgentResearch } from '../definitions/types';
import { parseAgentOutput } from '../runtime/parser';
import * as registry from '../runtime/registry';

export interface DossierEvidence {
  source: string;
  kind: string;
  detail: string;
  url?: string;
  rawData?: string;
  reason?: string;
}

import type { DiscoveryCompanyDossier, NormalizedOpportunity } from '../definitions/types';
import { generateEmergingTicker } from '../../domain/watchlist/watchlist';
import { logError } from '../../infra/db/error-log';

const AGENT_LABELS: Record<string, string> = {
  commodities: 'Commodity & supply chain',
  future_opportunist: 'Growth & IPO scout',
  conservationist: 'Defensive compounder',
  crypto_analysis: 'Crypto & digital assets',
  macroeconomic: 'Macro & geopolitics',
  regulatory_discovery: 'Regulatory & policy',
  industry_surge: 'Industry surge detector',
};

const GENERIC_PHRASES = [
  'ticker',
  'found in tool results',
  'inferred from tool evidence',
  'mentioned in seeded research',
  'evidence_fallback',
];

interface ParsedSeedBlock {
  tool: string;
  data: unknown;
}

function isGenericText(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
}

function seedBlocksForAgent(agent: DiscoveryAgentResearch): ParsedSeedBlock[] {
  return (agent.seedResults ?? [])
    .filter((seed) => seed.ok && seed.result !== undefined)
    .map((seed) => ({
      tool: seed.name,
      data: seed.result,
    }));
}

function providerLabel(tool: string): string {
  const prefix = tool.split('_')[0] ?? tool;
  const labels: Record<string, string> = {
    gdelt: 'GDELT',
    fred: 'FRED',
    guardian: 'The Guardian',
    currentsapi: 'Currents API',
    rss: 'RSS / regulatory feeds',
    edgar: 'SEC EDGAR',
    fmp: 'FMP',
  };
  return labels[prefix] ?? prefix;
}

function mentionsCompany(text: string, ticker: string, name: string): boolean {
  const haystack = text.toUpperCase();
  const symbol = ticker.toUpperCase();

  if (new RegExp(`\\$${symbol}\\b`).test(haystack)) return true;
  if (new RegExp(`\\(${symbol}\\)`).test(haystack)) return true;
  if (new RegExp(`\\b${symbol}\\b`).test(haystack)) return true;
  if (haystack.includes(`${symbol}_`) || haystack.includes(`_${symbol}`)) return true;

  if (name && name !== 'Unknown' && name.toUpperCase() !== symbol) {
    const words = name.split(/\s+/).filter((word) => word.length > 3);
    if (words.length >= 2 && words.every((word) => haystack.includes(word.toUpperCase()))) {
      return true;
    }
  }

  return false;
}

function extractEvidenceFromSeed(
  block: ParsedSeedBlock,
  ticker: string,
  name: string
): DossierEvidence[] {
  const rows: DossierEvidence[] = [];
  const data = block.data;

  const push = (fields: {
    title?: string;
    description?: string;
    url?: string;
    kind: string;
  }) => {
    const blob = [fields.title, fields.description, fields.url].filter(Boolean).join(' ');
    if (!mentionsCompany(blob, ticker, name)) return;

    rows.push({
      source: providerLabel(block.tool),
      kind: fields.kind,
      detail: (fields.title || fields.description || blob).slice(0, 280),
      url: fields.url,
    });
  };

  if (Array.isArray(data)) {
    for (const entry of data) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const items = Array.isArray(record.items) ? record.items : [record];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        push({
          kind: 'feed item',
          title: String(row.title ?? ''),
          description: String(row.description ?? row.summary ?? ''),
          url: String(row.link ?? row.url ?? ''),
        });
      }
    }
    return rows;
  }

  if (!data || typeof data !== 'object') return rows;

  const record = data as Record<string, unknown>;
  const hits = (record.hits as { hits?: unknown[] } | undefined)?.hits;
  if (Array.isArray(hits)) {
    for (const hit of hits) {
      if (!hit || typeof hit !== 'object') continue;
      const hitRecord = hit as Record<string, unknown>;
      const source = (hitRecord._source as Record<string, unknown> | undefined) ?? hitRecord;
      push({
        kind: 'SEC filing',
        title: String(source.display_names ?? source.entity_name ?? hitRecord._id ?? ''),
        description: String(source.file_description ?? source.form ?? ''),
        url: String(source.file_url ?? source.link ?? ''),
      });
    }
  }

  for (const list of [record.news, record.articles, record.results, record.filings].filter(
    Array.isArray
  ) as unknown[][]) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      push({
        kind: 'news',
        title: String(row.title ?? row.name ?? ''),
        description: String(row.description ?? row.summary ?? ''),
        url: String(row.url ?? row.link ?? ''),
      });
    }
  }

  return rows;
}

export function collectTickerEvidence(
  ticker: string,
  name: string,
  agents: DiscoveryAgentResearch[]
): { evidence: DossierEvidence[]; discoveredBy: string[] } {
  const evidence: DossierEvidence[] = [];
  const discoveredBy = new Set<string>();

  for (const agent of agents) {
    let matched = false;

    for (const company of agent.companies) {
      if (company.ticker === ticker) {
        discoveredBy.add(agent.agentId);
        matched = true;
      }
    }

    for (const block of seedBlocksForAgent(agent)) {
      const rows = extractEvidenceFromSeed(block, ticker, name);
      if (rows.length > 0) {
        discoveredBy.add(agent.agentId);
        matched = true;
        evidence.push(...rows);
      }
    }

    if (matched) {
      discoveredBy.add(agent.agentId);
    }
  }

  const seen = new Set<string>();
  const deduped = evidence.filter((row) => {
    const key = `${row.source}|${row.detail}|${row.url ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { evidence: deduped.slice(0, 10), discoveredBy: [...discoveredBy] };
}

async function loadMarketProfile(ticker: string): Promise<{
  valid: boolean;
  reason?: string;
  name?: string;
  industry?: string;
  exchange?: string;
  price?: number;
  marketCap?: number;
  currency?: string;
}> {
  const readProfile = (data: unknown): {
    name: string;
    industry: string;
    exchange: string;
    isEtf: boolean;
    isFund: boolean;
  } | null => {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;
    const name = String(record.companyName ?? record.name ?? '').trim();
    const industry = String(record.industry ?? record.sector ?? record.finnhubIndustry ?? '').trim();
    const exchange = String(record.exchangeShortName ?? record.exchange ?? '').trim();

    return {
      name,
      industry,
      exchange,
      isEtf: record.isEtf === true,
      isFund: record.isFund === true,
    };
  };

  let profile = readProfile(
    (
      await registry.execute({
        name: 'fmp_profile',
        parameters: { symbol: ticker },
      })
    ).result
  );

  const fmpOk = profile != null;
  if (!fmpOk) {
    const finnhubResult = await registry.execute({
      name: 'finnhub_company_profile',
      parameters: { symbol: ticker },
    });
    if (finnhubResult.ok) {
      profile = readProfile(finnhubResult.result);
    }
  }

  if (!profile) {
    return { valid: false, reason: 'No company profile — likely not a US-listed equity' };
  }

  const { name, industry, exchange, isEtf, isFund } = profile;

  if (!name || name.toUpperCase() === ticker) {
    return { valid: false, reason: 'Profile missing a real company name' };
  }

  if (isEtf || isFund) {
    return { valid: false, reason: 'Instrument is an ETF/fund, not an operating company' };
  }

  let price: number | undefined;
  let marketCap: number | undefined;
  let currency: string | undefined;

  const quoteResult = await registry.execute({
    name: 'fmp_quote',
    parameters: { symbol: ticker },
  });

  if (quoteResult.ok) {
    const quoteRow = Array.isArray(quoteResult.result) ? quoteResult.result[0] : quoteResult.result;
    if (quoteRow && typeof quoteRow === 'object') {
      const q = quoteRow as Record<string, unknown>;
      price = q.price != null ? Number(q.price) : undefined;
      marketCap = q.marketCap != null ? Number(q.marketCap) : undefined;
      currency = q.currency ? String(q.currency) : undefined;
    }
  }

  return {
    valid: true,
    name,
    industry: industry || 'Unknown',
    exchange,
    price,
    marketCap,
    currency,
  };
}

function buildSynthesisPrompt(
  ticker: string,
  profile: Awaited<ReturnType<typeof loadMarketProfile>>,
  discoveredBy: string[],
  evidence: DossierEvidence[]
): string {
  const angles = discoveredBy.map((id) => AGENT_LABELS[id] ?? id).join(', ');
  const evidenceBlock = evidence
    .map(
      (row, index) =>
        `${index + 1}. [${row.source} / ${row.kind}] ${row.detail}${row.url ? ` (${row.url})` : ''}`
    )
    .join('\n');

  return `Write a discovery dossier for this US public company using ONLY the evidence below.
Do not invent facts, prices, or tickers not in the evidence or profile block.

Company profile:
- Ticker: ${ticker}
- Name: ${profile.name}
- Industry: ${profile.industry}
- Exchange: ${profile.exchange ?? 'unknown'}
- Price: ${profile.price ?? 'unknown'}
- Market cap: ${profile.marketCap ?? 'unknown'}
- Discovery angles: ${angles || 'general discovery'}

Evidence:
${evidenceBlock || '(no headline evidence — base summary on profile only)'}

Return ONLY JSON inside <agent_output>...</agent_output>:
{
  "summary": "2-4 sentences: what the company does, current context, and investment relevance",
  "whyAdded": "1-2 sentences: why it surfaced in discovery",
  "risk": "Key risks in plain language",
  "opportunity": "Key upside or catalysts",
  "industryContext": "Industry dynamics and positioning",
  "rivals": "Main competitors or peers (tickers if known)",
  "geopolitics": "Regulatory, macro, or geopolitical angles (or 'Limited direct exposure' if none)",
  "recommendation": "WATCH",
  "confidence": 55,
  "evidence": [
    {"source": "EDGAR", "finding": "Specific fact from evidence", "url": "optional"}
  ]
}`;
}

async function synthesizeOneDossier(
  company: DiscoveryCompanyRecord,
  agents: DiscoveryAgentResearch[],
  model: string
): Promise<DiscoveryCompanyDossier> {
  const profile = await loadMarketProfile(company.ticker);

  if (!profile.valid) {
    return {
      ticker: company.ticker,
      name: company.name,
      industry: company.industry,
      confidence: company.confidence,
      recommendation: 'REJECT',
      discoveredBy: [],
      summary: '',
      whyAdded: '',
      risk: '',
      opportunity: '',
      industryContext: '',
      rivals: '',
      geopolitics: '',
      stockSnapshot: {},
      evidence: [],
      synthesized: false,
      rejected: true,
      rejectReason: profile.reason,
    };
  }

  const { evidence, discoveredBy } = collectTickerEvidence(
    company.ticker,
    profile.name ?? company.name,
    agents
  );

  const prompt = buildSynthesisPrompt(company.ticker, profile, discoveredBy, evidence);

  let parsed: Record<string, unknown> | null = null;

  try {
    const text = await callDeepAI({ model, messages: [{ role: 'user', content: prompt }] });
    parsed = parseAgentOutput<Record<string, unknown>>(text);
  } catch (error) {
      logError(error, { source: 'agents/discovery-dossier.ts - synthesizeOneDossier' });
    parsed = null;
  }

  const synthesizedEvidence: DossierEvidence[] = Array.isArray(parsed?.evidence)
    ? (parsed!.evidence as Array<Record<string, unknown>>)
        .map((row) => ({
          source: String(row.source ?? 'research'),
          kind: 'synthesis',
          detail: String(row.finding ?? row.detail ?? ''),
          url: row.url ? String(row.url) : undefined,
        }))
        .filter((row) => row.detail && !isGenericText(row.detail))
    : [];

  const mergedEvidence = [...evidence];
  for (const row of synthesizedEvidence) {
    if (!mergedEvidence.some((existing) => existing.detail === row.detail)) {
      mergedEvidence.push(row);
    }
  }

  const summary = String(parsed?.summary ?? '').trim();
  const whyAdded = String(parsed?.whyAdded ?? '').trim();

  return {
    ticker: company.ticker,
    name: profile.name ?? company.name,
    industry: profile.industry ?? company.industry,
    confidence: Math.min(
      100,
      Math.max(company.confidence, Number(parsed?.confidence ?? company.confidence))
    ),
    recommendation: String(parsed?.recommendation ?? 'WATCH'),
    discoveredBy,
    summary: summary || `${profile.name} (${company.ticker}) — ${profile.industry}.`,
    whyAdded:
      whyAdded ||
      `Surfaced during ${discoveredBy.map((id) => AGENT_LABELS[id] ?? id).join(', ') || 'discovery'}.`,
    risk: String(parsed?.risk ?? 'Requires further diligence.'),
    opportunity: String(parsed?.opportunity ?? 'Monitor for catalysts.'),
    industryContext: String(parsed?.industryContext ?? profile.industry ?? ''),
    rivals: String(parsed?.rivals ?? 'Not identified in this run.'),
    geopolitics: String(parsed?.geopolitics ?? 'Limited direct exposure identified.'),
    stockSnapshot: {
      exchange: profile.exchange,
      price: profile.price,
      marketCap: profile.marketCap,
      currency: profile.currency,
    },
    evidence: mergedEvidence,
    synthesized: Boolean(parsed),
    rejected: false,
  };
}

export async function buildDiscoveryDossiers(options: {
  companies: DiscoveryCompanyRecord[];
  agents: DiscoveryAgentResearch[];
  model: string;
}): Promise<DiscoveryCompanyDossier[]> {
  return Promise.all(
    options.companies.map((company) =>
      synthesizeOneDossier(company, options.agents, options.model)
    )
  );
}

export function acceptedDossiers(dossiers: DiscoveryCompanyDossier[]): DiscoveryCompanyDossier[] {
  return dossiers.filter((dossier) => !dossier.rejected);
}

function opportunityEvidenceRows(opp: NormalizedOpportunity): DossierEvidence[] {
  return opp.evidence.map((row) => ({
    source: row.source,
    kind: 'agent evidence',
    detail: row.summary || row.reason,
    rawData: row.rawData,
    reason: row.reason,
  }));
}

async function dossierFromOpportunity(
  opp: NormalizedOpportunity,
  model: string
): Promise<DiscoveryCompanyDossier> {
  const isEmerging =
    opp.listingStatus !== 'listed' || !opp.ticker?.trim();

  if (isEmerging) {
    if (opp.evidence.length < 2) {
      return {
        ticker: opp.ticker ?? generateEmergingTicker(opp.company),
        name: opp.company,
        industry: opp.industry,
        confidence: opp.confidence,
        recommendation: 'REJECT',
        title: opp.title,
        listingStatus: opp.listingStatus,
        titanScore: opp.titanScore,
        riskScore: opp.risk_score,
        discoveredBy: opp.discoveredBy,
        summary: '',
        whyAdded: '',
        risk: '',
        opportunity: '',
        industryContext: '',
        rivals: '',
        geopolitics: '',
        stockSnapshot: {},
        evidence: [],
        synthesized: false,
        rejected: true,
        rejectReason: 'Emerging candidate requires at least 2 evidence items',
      };
    }

    const ticker = opp.ticker?.trim() || generateEmergingTicker(opp.company);

    return {
      ticker,
      name: opp.company,
      industry: opp.industry,
      confidence: opp.confidence,
      recommendation: 'WATCH',
      title: opp.title,
      listingStatus: opp.listingStatus,
      titanScore: opp.titanScore,
      riskScore: opp.risk_score,
      discoveredBy: opp.discoveredBy,
      summary: opp.description,
      whyAdded: opp.evidence.map((e) => e.reason).join(' '),
      risk: `Risk score ${opp.risk_score}/100 from discovery agents.`,
      opportunity: `Titan score ${opp.titanScore}/100 — ${opp.title}`,
      industryContext: opp.industry,
      rivals: 'Not identified in this run.',
      geopolitics: 'See evidence for policy/macro angles.',
      stockSnapshot: {},
      evidence: opportunityEvidenceRows(opp),
      synthesized: true,
      rejected: false,
    };
  }

  const companyRecord = {
    ticker: opp.ticker!,
    name: opp.company,
    industry: opp.industry,
    confidence: opp.confidence,
  };

  const dossier = await synthesizeOneDossier(companyRecord, [], model);

  return {
    ...dossier,
    title: opp.title,
    listingStatus: opp.listingStatus,
    titanScore: opp.titanScore,
    riskScore: opp.risk_score,
    discoveredBy: opp.discoveredBy,
    summary: dossier.summary || opp.description,
    whyAdded: dossier.whyAdded || opp.evidence.map((e) => e.reason).join(' '),
    evidence: [...opportunityEvidenceRows(opp), ...dossier.evidence].slice(0, 12),
    synthesized: true,
  };
}

export async function buildDiscoveryDossiersFromOpportunities(options: {
  opportunities: NormalizedOpportunity[];
  model: string;
}): Promise<DiscoveryCompanyDossier[]> {
  return Promise.all(
    options.opportunities.map((opp) => dossierFromOpportunity(opp, options.model))
  );
}

export interface DiscoveryCompanyRecord {
  ticker: string;
  name: string;
  industry: string;
  confidence: number;
}

function profileFromResult(data: unknown): { industry?: string; name?: string } {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== 'object') {
    return {};
  }

  const record = row as Record<string, unknown>;
  const industry = String(record.industry ?? record.sector ?? record.finnhubIndustry ?? '').trim();
  const name = String(record.companyName ?? record.name ?? '').trim();

  return {
    industry: industry || undefined,
    name: name || undefined,
  };
}

function needsEnrichment(company: DiscoveryCompanyRecord): boolean {
  return (
    !company.industry ||
    company.industry === 'Unknown' ||
    !company.name ||
    company.name === 'Unknown' ||
    company.name.toUpperCase() === company.ticker
  );
}

async function lookupProfile(ticker: string): Promise<{ industry?: string; name?: string }> {
  const fmp = await registry.execute({
    name: 'fmp_profile',
    parameters: { symbol: ticker },
  });

  if (fmp.ok) {
    return profileFromResult(fmp.result);
  }

  const finnhub = await registry.execute({
    name: 'finnhub_company_profile',
    parameters: { symbol: ticker },
  });

  if (finnhub.ok) {
    return profileFromResult(finnhub.result);
  }

  return {};
}

export async function enrichDiscoveryCompanies(
  companies: DiscoveryCompanyRecord[]
): Promise<DiscoveryCompanyRecord[]> {
  return Promise.all(
    companies.map(async (company) => {
      if (!needsEnrichment(company)) {
        return company;
      }

      const profile = await lookupProfile(company.ticker);

      return {
        ...company,
        industry: profile.industry ?? company.industry,
        name: profile.name ?? company.name,
      };
    })
  );
}
