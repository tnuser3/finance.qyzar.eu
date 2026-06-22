import type { WatchlistCompany } from '../watchlist/watchlist';
import type { EventSeverity, EventType } from './store';
import { runAgent } from '../../agents/runtime/agent';
import { parseAgentOutput } from '../../agents/runtime/parser';
import type { NewsHeadline } from './headlines';
import { logError } from '../../infra/db/error-log';

const DEFAULT_MODEL = process.env.AGENT_MODEL ?? 'gpt-4';
const BATCH_SIZE = Number(process.env.EVENT_HEADLINE_BATCH_SIZE) || 10;
const AI_ENABLED = process.env.EVENT_AI_ENABLED !== 'false';
const MAX_WATCHLIST_FOR_AI =
  Number(process.env.EVENT_AI_WATCHLIST_LIMIT) || 200;

export interface HeadlineMatch {
  headlineId: string;
  primaryTicker: string;
  relatedTickers: string[];
  eventType: EventType;
  severity: EventSeverity;
  confidence: number;
  reason: string;
}

function inferSeverity(title: string, priority: number): EventSeverity {
  const lower = title.toLowerCase();
  const highWords = ['sue', 'lawsuit', 'fraud', 'investigation', 'sanction', 'halt', 'suspend'];

  if (highWords.some((word) => lower.includes(word))) {
    return 'high';
  }

  if (priority === 1) {
    return 'medium';
  }

  return 'low';
}

function matchesCompany(text: string, ticker: string, name: string): boolean {
  const haystack = text.toLowerCase();
  const words = name.toLowerCase().split(/\s+/).filter((word) => word.length > 3);

  return (
    haystack.includes(ticker.toLowerCase()) ||
    words.some((word) => haystack.includes(word))
  );
}

function buildWatchlistIndex(companies: WatchlistCompany[]): string {
  return companies
    .slice(0, MAX_WATCHLIST_FOR_AI)
    .map(
      (company) =>
        `${company.ticker}|${company.name}|${company.industry}|P${company.watchPriority}`
    )
    .join('\n');
}

function parseAiMatches(text: string): HeadlineMatch[] {
  const parsed = parseAgentOutput<{
    matches?: Array<Record<string, unknown>>;
  }>(text);

  if (!parsed?.matches?.length) {
    return [];
  }

  const results: HeadlineMatch[] = [];

  for (const row of parsed.matches) {
    const headlineId = String(row.headlineId ?? row.headline_id ?? '').trim();
    const primaryTicker = String(row.primaryTicker ?? row.primary_ticker ?? '')
      .trim()
      .toUpperCase();

    if (!headlineId || !primaryTicker) {
      continue;
    }

    const related = Array.isArray(row.relatedTickers ?? row.related_tickers)
      ? (row.relatedTickers ?? row.related_tickers).map((value) =>
          String(value).trim().toUpperCase()
        )
      : [];

    results.push({
      headlineId,
      primaryTicker,
      relatedTickers: related.filter((ticker) => ticker && ticker !== primaryTicker),
      eventType: (String(row.eventType ?? row.event_type ?? 'news') as EventType),
      severity: (String(row.severity ?? 'medium') as EventSeverity),
      confidence: Math.min(100, Math.max(0, Number(row.confidence ?? 60))),
      reason: String(row.reason ?? row.summary ?? '').trim(),
    });
  }

  return results;
}

async function analyzeBatch(
  headlines: NewsHeadline[],
  companies: WatchlistCompany[]
): Promise<HeadlineMatch[]> {
  const allowedTickers = new Set(companies.map((company) => company.ticker));
  const headlineBlock = headlines
    .map(
      (headline) =>
        `- id=${headline.id}\n  title=${headline.title}\n  source=${headline.sourceLabel ?? headline.source}\n  description=${headline.description ?? ''}`
    )
    .join('\n');

  const result = await runAgent({
    model: DEFAULT_MODEL,
    maxIterations: 2,
    allowTools: false,
    system: `You match finance news headlines to a watchlist of public companies.

Rules:
- Only use tickers from the watchlist index.
- primaryTicker is the main company the headline is about.
- relatedTickers are other watchlist companies materially mentioned or clearly affected (suppliers, customers, competitors, partners).
- Do not invent tickers.
- If no watchlist company is clearly involved, omit that headline.
- Prefer explicit ticker or company name mentions over weak inference.

Return ONLY JSON inside:
<agent_output>
{
  "matches": [
    {
      "headlineId": "string",
      "primaryTicker": "AAPL",
      "relatedTickers": ["TSMC"],
      "eventType": "news|regulatory|market|sentiment",
      "severity": "low|medium|high",
      "confidence": 0,
      "reason": "one sentence"
    }
  ]
}
</agent_output>`,
    prompt: `Watchlist index (ticker|name|industry|priority):
${buildWatchlistIndex(companies)}

Headlines:
${headlineBlock}

Analyze each headline.`,
  });

  return parseAiMatches(result.text).filter((match) => allowedTickers.has(match.primaryTicker));
}

export function analyzeHeadlinesWithRules(
  headlines: NewsHeadline[],
  companies: WatchlistCompany[]
): HeadlineMatch[] {
  const matches: HeadlineMatch[] = [];

  for (const headline of headlines) {
    const text = `${headline.title} ${headline.description ?? ''}`;
    let best: WatchlistCompany | null = null;

    for (const company of companies) {
      if (!matchesCompany(text, company.ticker, company.name)) {
        continue;
      }

      if (
        !best ||
        company.watchPriority < best.watchPriority ||
        (company.watchPriority === best.watchPriority && company.confidence > best.confidence)
      ) {
        best = company;
      }
    }

    if (!best) {
      continue;
    }

    const relatedTickers = companies
      .filter(
        (company) =>
          company.id !== best!.id &&
          company.watchPriority <= 2 &&
          matchesCompany(text, company.ticker, company.name)
      )
      .slice(0, 5)
      .map((company) => company.ticker);

    matches.push({
      headlineId: headline.id,
      primaryTicker: best.ticker,
      relatedTickers: relatedTickers.filter((ticker) => ticker !== best!.ticker),
      eventType: headline.eventTypeHint,
      severity: inferSeverity(headline.title, best.watchPriority),
      confidence: 55,
      reason: 'Keyword match against watchlist company name or ticker.',
    });
  }

  return matches;
}

export async function analyzeHeadlines(
  headlines: NewsHeadline[],
  companies: WatchlistCompany[]
): Promise<HeadlineMatch[]> {
  if (headlines.length === 0 || companies.length === 0) {
    return [];
  }

  if (!AI_ENABLED) {
    return analyzeHeadlinesWithRules(headlines, companies);
  }

  const headlineMap = new Map(headlines.map((headline) => [headline.id, headline]));
  const merged = new Map<string, HeadlineMatch>();

  for (let index = 0; index < headlines.length; index += BATCH_SIZE) {
    const batch = headlines.slice(index, index + BATCH_SIZE);

    try {
      const batchMatches = await analyzeBatch(batch, companies);

      for (const match of batchMatches) {
        if (!headlineMap.has(match.headlineId)) {
          continue;
        }

        merged.set(`${match.headlineId}:${match.primaryTicker}`, match);
      }
    } catch (error) {
      logError(error, { source: 'util/events/headline-analyzer.ts - analyzeHeadlines' });
      for (const match of analyzeHeadlinesWithRules(batch, companies)) {
        merged.set(`${match.headlineId}:${match.primaryTicker}`, match);
      }
    }
  }

  return Array.from(merged.values());
}
