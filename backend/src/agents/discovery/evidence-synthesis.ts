import { callDeepAI } from '../../providers/ai/deepai';
import type { DiscoveryOpportunity, DiscoveryOpportunityEvidence } from '../definitions/types';
import { DISCOVERY_OPPORTUNITY_FORMAT } from '../definitions/shared';
import {
  filterEnglishOpportunities,
  isEnglishLanguageTag,
  isEnglishText,
} from './helpers';
import {
  extractDiscoveryOpportunities,
  hasValidStructuredDiscoveryOutput,
  parseAgentOutput,
} from '../runtime/parser';
import { withComputedScores } from './helpers';
import { logError } from '../../infra/db/error-log';

const MAX_EVIDENCE_CHARS = 10_000;

const AGENT_FOCUS: Record<string, string> = {
  commodities: 'commodity supply chains, energy, metals, agriculture, semiconductors',
  crypto_analysis: 'crypto markets and related public equities',
  macroeconomic: 'macro conditions, rates, inflation, beneficiary sectors',
  future_opportunist: 'IPOs, growth sectors, emerging market leaders',
  conservationist: 'durable low-volatility compounders',
  industry_surge: 'industries gaining public/government attention and their leaders',
  regulatory_discovery: 'regulatory themes and affected companies',
};

const TICKER_FROM_URL = /(?:nasdaq|nyse|stockanalysis)\.com\/(?:stock|quote)\/([a-z]{1,5})/i;
const TICKER_SYMBOL = /\$([A-Z]{1,5})\b/g;
const KNOWN_CRYPTO_EQUITIES: Record<string, { ticker: string; company: string; industry: string }> = {
  bitcoin: { ticker: 'COIN', company: 'Coinbase Global', industry: 'Crypto Infrastructure' },
  ethereum: { ticker: 'COIN', company: 'Coinbase Global', industry: 'Crypto Infrastructure' },
  etf: { ticker: 'COIN', company: 'Coinbase Global', industry: 'Crypto Infrastructure' },
  microstrategy: { ticker: 'MSTR', company: 'MicroStrategy', industry: 'Software / Bitcoin Treasury' },
  nuclear: { ticker: 'SMR', company: 'NuScale Power', industry: 'Nuclear Energy' },
  oil: { ticker: 'XOM', company: 'Exxon Mobil', industry: 'Oil & Gas' },
  crude: { ticker: 'XOM', company: 'Exxon Mobil', industry: 'Oil & Gas' },
  semiconductor: { ticker: 'NVDA', company: 'NVIDIA', industry: 'Semiconductors' },
  utility: { ticker: 'NEE', company: 'NextEra Energy', industry: 'Utilities' },
  inflation: { ticker: 'COST', company: 'Costco', industry: 'Consumer Staples' },
};

interface NewsHit {
  title: string;
  description: string;
  url: string;
  source: string;
}

function parseCoingeckoHits(data: unknown, tool: string): NewsHit[] {
  if (!Array.isArray(data)) return [];
  const hits: NewsHit[] = [];
  for (const row of data.slice(0, 3)) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const name = String(record.name ?? '');
    const price = record.current_price;
    if (!name || !isEnglishText(name)) continue;
    const title = `${name} market leader (CoinGecko)`;
    const description = `${name} at $${price} - rank ${record.market_cap_rank ?? '?'} by market cap per coingecko_markets seed.`;
    if (!isEnglishText(description)) continue;
    hits.push({ title, description, url: '', source: tool });
  }
  return hits;
}

function parseRawTitleLines(raw: string, tool: string): NewsHit[] {
  const hits: NewsHit[] = [];
  const titleMatch = raw.match(/"title"\s*:\s*"([^"]{15,200})"/g);
  if (titleMatch) {
    for (const m of titleMatch) {
      const title = m.replace(/"title"\s*:\s*"/, '').replace(/"$/, '');
      if (!isEnglishText(title)) continue;
      hits.push({ title, description: title, url: '', source: tool });
    }
  }
  const lineMatch = raw.match(/^Title:\s*(.+)$/gim);
  if (lineMatch) {
    for (const line of lineMatch) {
      const title = line.replace(/^Title:\s*/i, '').trim();
      if (!isEnglishText(title)) continue;
      hits.push({ title, description: title, url: '', source: tool });
    }
  }
  return hits;
}

function parseSeedNewsHits(evidence: string): NewsHit[] {
  const hits: NewsHit[] = [];
  const blocks = evidence.split(/\[seed:([^\]]+)\]/);

  for (let i = 1; i < blocks.length; i += 2) {
    const tool = blocks[i]?.trim() ?? 'unknown';
    const raw = blocks[i + 1]?.trim() ?? '';
    if (!raw) continue;

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      logError(error, { source: 'agents/discovery-evidence-synthesis.ts - parseSeedNewsHits' });
      hits.push(...parseRawTitleLines(raw, tool));
      continue;
    }

    if (tool.includes('coingecko')) {
      hits.push(...parseCoingeckoHits(data, tool));
    }

    const push = (row: Record<string, unknown>) => {
      const title = String(row.title ?? '').trim();
      const description = String(row.description ?? row.summary ?? '').trim();
      const url = String(row.url ?? row.link ?? '').trim();
      const language = String(row.language ?? row.sourcelang ?? 'en').toLowerCase();
      if (!title || title.length < 15) return;
      if (!isEnglishLanguageTag(language)) return;
      if (!isEnglishText(title)) return;
      if (description && !isEnglishText(description)) return;

      hits.push({
        title,
        description: description || title,
        url,
        source: tool.split('_')[0] ?? tool,
      });
    };

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === 'object') push(item as Record<string, unknown>);
      }
      continue;
    }

    if (!data || typeof data !== 'object') continue;
    const record = data as Record<string, unknown>;
    for (const list of [record.news, record.articles, record.results].filter(Array.isArray) as unknown[][]) {
      for (const item of list) {
        if (item && typeof item === 'object') push(item as Record<string, unknown>);
      }
    }
  }

  return hits.slice(0, 8);
}

function inferEquityFromText(text: string): {
  ticker?: string;
  company: string;
  industry: string;
} {
  const lower = text.toLowerCase();
  const urlMatch = text.match(TICKER_FROM_URL);
  if (urlMatch?.[1]) {
    const ticker = urlMatch[1].toUpperCase();
    return { ticker, company: ticker, industry: 'Unknown' };
  }

  for (const [keyword, equity] of Object.entries(KNOWN_CRYPTO_EQUITIES)) {
    if (lower.includes(keyword)) return equity;
  }

  for (const match of text.matchAll(TICKER_SYMBOL)) {
    const ticker = match[1];
    if (ticker && ticker.length >= 2) {
      return { ticker, company: ticker, industry: 'Unknown' };
    }
  }

  return { company: 'Emerging leader', industry: 'Unknown' };
}

export function buildOpportunitiesFromSeedEvidence(
  evidence: string,
  agentId: string
): DiscoveryOpportunity[] {
  const hits = parseSeedNewsHits(evidence);
  const opportunities: DiscoveryOpportunity[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const blob = `${hit.title} ${hit.description} ${hit.url}`;
    const equity = inferEquityFromText(blob);
    const key = equity.ticker ?? hit.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);

    const company =
      equity.company !== 'Emerging leader' && isEnglishText(equity.company)
        ? equity.company
        : equity.ticker ?? 'Emerging US opportunity';

    const ev: DiscoveryOpportunityEvidence = {
      source: hit.source,
      rawData: hit.description.slice(0, 280) || hit.title,
      reason: 'English headline surfaced in seeded research for this theme',
      summary: hit.title.slice(0, 120),
    };

    const description =
      hit.description.length >= 40
        ? hit.description.slice(0, 500)
        : `${hit.title}. ${hit.description}`.slice(0, 500);

    opportunities.push(
      withComputedScores({
        title: hit.title.slice(0, 120),
        description,
        ticker: equity.ticker,
        company,
        industry: equity.industry,
        listingStatus: equity.ticker ? 'listed' : 'emerging',
        confidence: 55,
        risk_score: 50,
        titanScore: 52,
        evidence: [ev],
        agentId,
      })
    );

    if (opportunities.length >= 3) break;
  }

  return filterEnglishOpportunities(opportunities);
}

function wrapOpportunitiesOutput(
  opportunities: DiscoveryOpportunity[],
  summary: string,
  shortfallNote?: string
): string {
  return `<agent_output>
${JSON.stringify({ opportunities, summary, shortfallNote }, null, 2)}
</agent_output>`;
}

export async function synthesizeDiscoveryOutputFromEvidence(options: {
  agentId: string;
  task: string;
  evidence: string;
  model: string;
  minOpportunities?: number;
}): Promise<string> {
  const trimmed =
    options.evidence.length > MAX_EVIDENCE_CHARS
      ? `${options.evidence.slice(0, MAX_EVIDENCE_CHARS)}\n...[truncated]`
      : options.evidence;

  const focus = AGENT_FOCUS[options.agentId] ?? 'US investment opportunities';
  const min = options.minOpportunities ?? 2;

  const prompt = `You are the ${options.agentId} discovery agent. Synthesize investment opportunities from the evidence only.

Task: ${options.task}
Focus: ${focus}

Rules:
- Use ONLY facts from the evidence below.
- ALL text MUST be English only (ASCII). Skip non-English sources entirely.
- Return ${min} opportunities when possible.
- Each needs title, description (80+ chars), company, industry, ticker if known, evidence array.

Evidence:
${trimmed}

${DISCOVERY_OPPORTUNITY_FORMAT}`;

  try {
    const text = await callDeepAI({
      model: options.model,
      messages: [{ role: 'user', content: prompt }],
    });

    if (hasValidStructuredDiscoveryOutput(text)) {
      const parsed = extractDiscoveryOpportunities(text, options.agentId);
      const english = filterEnglishOpportunities(parsed.opportunities);
      if (english.length > 0) {
        return wrapOpportunitiesOutput(english, parsed.summary, parsed.shortfallNote);
      }
    }

    const parsed = extractDiscoveryOpportunities(text, options.agentId);
    const english = filterEnglishOpportunities(parsed.opportunities);
    if (english.length > 0) {
      return wrapOpportunitiesOutput(english, parsed.summary, parsed.shortfallNote);
    }
  } catch (error) {
      logError(error, { source: 'agents/discovery-evidence-synthesis.ts - synthesizeDiscoveryOutputFromEvidence' });
  }

  const built = buildOpportunitiesFromSeedEvidence(trimmed, options.agentId);
  if (built.length === 0) return '';

  return wrapOpportunitiesOutput(
    built,
    `Built ${built.length} English opportunit${built.length === 1 ? 'y' : 'ies'} from seeded tool evidence (${options.agentId}).`,
    built.length < min
      ? `Only ${built.length} English headline(s) with investment angles found in seeds.`
      : undefined
  );
}
