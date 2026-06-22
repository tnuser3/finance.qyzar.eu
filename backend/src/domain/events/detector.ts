import * as events from './store';
import * as watchlist from '../watchlist/watchlist';
import { runEventWorkflow as processEvent } from '../../agents/workflows/event';
import { collectHeadlines } from './headlines';
import { analyzeHeadlines } from './headline-analyzer';

const MAX_EVENTS_PER_TICK = Number(process.env.EVENT_MAX_PER_TICK) || 5;

async function persistMatches(
  headlines: Awaited<ReturnType<typeof collectHeadlines>>,
  companies: watchlist.WatchlistCompany[]
): Promise<number> {
  const headlineMap = new Map(headlines.map((headline) => [headline.id, headline]));
  const companyByTicker = new Map(companies.map((company) => [company.ticker, company]));
  const matches = await analyzeHeadlines(headlines, companies);
  let inserted = 0;

  for (const match of matches) {
    const headline = headlineMap.get(match.headlineId);
    const primary = companyByTicker.get(match.primaryTicker);

    if (!headline || !primary) {
      continue;
    }

    const relatedTickers = match.relatedTickers.filter((ticker) => companyByTicker.has(ticker));
    const baseMetadata = {
      headlineId: headline.id,
      confidence: match.confidence,
      matchType: process.env.EVENT_AI_ENABLED !== 'false' ? 'ai' : 'rules',
    };

    const primaryEvent = await events.insertEvent({
      companyId: primary.id,
      eventType: match.eventType,
      source: headline.source,
      title: headline.title,
      url: headline.url,
      description: headline.description,
      publishedAt: headline.publishedAt,
      severity: match.severity,
      aiSummary: match.reason,
      relatedTickers,
      metadata: {
        ...baseMetadata,
        role: 'primary',
        sourceLabel: headline.sourceLabel ?? headline.source,
      },
    });

    if (primaryEvent) {
      inserted++;
    }

    for (const ticker of relatedTickers) {
      const relatedCompany = companyByTicker.get(ticker);

      if (!relatedCompany) {
        continue;
      }

      const relatedEvent = await events.insertEvent({
        companyId: relatedCompany.id,
        eventType: match.eventType,
        source: headline.source,
        title: headline.title,
        url: headline.url,
        description: headline.description,
        publishedAt: headline.publishedAt,
        severity: match.severity,
        aiSummary: match.reason,
        relatedTickers: [match.primaryTicker, ...relatedTickers.filter((value) => value !== ticker)],
        metadata: {
          ...baseMetadata,
          role: 'related',
          primaryTicker: match.primaryTicker,
          sourceLabel: headline.sourceLabel ?? headline.source,
        },
      });

      if (relatedEvent) {
        inserted++;
      }
    }
  }

  return inserted;
}

export async function detectEvents(): Promise<number> {
  const companies = await watchlist.listActive(500);

  if (companies.length === 0) {
    return 0;
  }

  const headlines = await collectHeadlines();
  return persistMatches(headlines, companies);
}

export async function drainEventQueue(): Promise<number> {
  const pending = await events.getPendingEvents(MAX_EVENTS_PER_TICK);
  let processed = 0;

  for (const event of pending) {
    const company = await watchlist.getById(event.companyId);
    const shouldProcess =
      event.severity === 'high' ||
      event.severity === 'medium' ||
      company?.watchPriority === 1;

    if (!shouldProcess) {
      await events.markSkipped(event.id);
      continue;
    }

    const result = await processEvent({ eventId: event.id });

    if (result.ok) {
      processed++;
    }
  }

  return processed;
}

export { processEvent as runEventWorkflow };
