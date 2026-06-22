import { createHash } from 'crypto';
import { isProviderAvailable } from '../../providers/command-availability';
import { latestNews as currentsLatest, searchNews as currentsSearch } from '../../providers/news/currentsapi';
import { articles as gdeltArticles } from '../../providers/news/gdelt';
import { search as gnewsSearch, topHeadlines as gnewsTopHeadlines } from '../../providers/news/gnews';
import { search as guardianSearch } from '../../providers/news/guardian';
import { marketNews as finnhubMarketNews } from '../../providers/market/finnhub';
import { fetchByTier } from '../../providers/news/rss/fetch';
import type { EventType } from './store';
import { logError } from '../../infra/db/error-log';

export interface NewsHeadline {
  id: string;
  title: string;
  url: string;
  description?: string;
  publishedAt?: string;
  source: string;
  sourceLabel?: string;
  eventTypeHint: EventType;
}

const MAX_HEADLINES =
  Number(process.env.EVENT_MAX_HEADLINES) || 120;
const SOURCE_TIMEOUT_MS =
  Number(process.env.EVENT_SOURCE_TIMEOUT_MS) || 25_000;

async function withSourceTimeout<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`${label} timed out after ${SOURCE_TIMEOUT_MS}ms`)),
          SOURCE_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - unknown' });
    return undefined;
  }
}

function headlineId(url: string, title: string): string {
  return createHash('sha256').update(`${url}:${title}`).digest('hex').slice(0, 16);
}

function normalizeUrl(url: string): string {
  return url.trim().split('#')[0] ?? url;
}

function pushHeadline(
  bucket: Map<string, NewsHeadline>,
  headline: Omit<NewsHeadline, 'id'>
): void {
  const url = normalizeUrl(headline.url);
  const title = headline.title.trim();

  if (!url || !title) {
    return;
  }

  const id = headlineId(url, title);

  if (bucket.has(id)) {
    return;
  }

  bucket.set(id, { ...headline, id, url, title });
}

async function collectRssHeadlines(bucket: Map<string, NewsHeadline>): Promise<void> {
  for (const tier of [1, 2] as const) {
    try {
      const feeds = await fetchByTier(tier, { limitPerFeed: 6 });

      for (const feed of feeds) {
        for (const item of feed.items) {
          pushHeadline(bucket, {
            title: item.title,
            url: item.link,
            description: item.description,
            publishedAt: item.pubDate,
            source: 'rss',
            sourceLabel: feed.feed.source,
            eventTypeHint: tier === 1 ? 'regulatory' : 'news',
          });
        }
      }
    } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectRssHeadlines' });

    }
  }
}

async function collectGnewsHeadlines(bucket: Map<string, NewsHeadline>): Promise<void> {
  if (!isProviderAvailable('gnews')) {
    return;
  }

  try {
    const top = (await gnewsTopHeadlines({
      category: 'business',
      country: 'us',
      max: 20,
    })) as { articles?: Array<Record<string, unknown>> };

    for (const row of top.articles ?? []) {
      pushHeadline(bucket, {
        title: String(row.title ?? ''),
        url: String(row.url ?? ''),
        description: String(row.description ?? ''),
        publishedAt: String(row.publishedAt ?? ''),
        source: 'gnews',
        sourceLabel: String((row.source as { name?: string })?.name ?? 'GNews'),
        eventTypeHint: 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectGnewsHeadlines' });

  }

  try {
    const search = (await gnewsSearch({
      q: 'earnings OR acquisition OR stock OR Nasdaq OR NYSE',
      lang: 'en',
      country: 'us',
      max: 20,
      sortby: 'publishedAt',
    })) as { articles?: Array<Record<string, unknown>> };

    for (const row of search.articles ?? []) {
      pushHeadline(bucket, {
        title: String(row.title ?? ''),
        url: String(row.url ?? ''),
        description: String(row.description ?? ''),
        publishedAt: String(row.publishedAt ?? ''),
        source: 'gnews',
        sourceLabel: String((row.source as { name?: string })?.name ?? 'GNews'),
        eventTypeHint: 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectGnewsHeadlines' });

  }
}

async function collectGuardianHeadlines(bucket: Map<string, NewsHeadline>): Promise<void> {
  if (!isProviderAvailable('guardian')) {
    return;
  }

  try {
    const payload = (await guardianSearch({
      q: 'business OR companies OR markets OR earnings',
      section: 'business',
      'page-size': 20,
    })) as {
      response?: {
        results?: Array<{
          webTitle?: string;
          webUrl?: string;
          webPublicationDate?: string;
          fields?: { trailText?: string };
        }>;
      };
    };

    for (const row of payload.response?.results ?? []) {
      pushHeadline(bucket, {
        title: String(row.webTitle ?? ''),
        url: String(row.webUrl ?? ''),
        description: row.fields?.trailText,
        publishedAt: row.webPublicationDate,
        source: 'guardian',
        sourceLabel: 'The Guardian',
        eventTypeHint: 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectGuardianHeadlines' });

  }
}

async function collectCurrentsHeadlines(bucket: Map<string, NewsHeadline>): Promise<void> {
  if (!isProviderAvailable('currentsapi')) {
    return;
  }

  try {
    const latest = await currentsLatest({ language: 'en' });

    for (const row of latest.news ?? []) {
      pushHeadline(bucket, {
        title: row.title,
        url: row.url,
        description: row.description,
        publishedAt: row.published,
        source: 'currentsapi',
        sourceLabel: 'Currents API',
        eventTypeHint: 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectCurrentsHeadlines' });

  }

  try {
    const search = await currentsSearch({
      keywords: 'stock market OR earnings OR merger OR IPO',
      language: 'en',
    });

    for (const row of search.news ?? []) {
      pushHeadline(bucket, {
        title: row.title,
        url: row.url,
        description: row.description,
        publishedAt: row.published,
        source: 'currentsapi',
        sourceLabel: 'Currents API',
        eventTypeHint: 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectCurrentsHeadlines' });

  }
}

async function collectGdeltHeadlines(bucket: Map<string, NewsHeadline>): Promise<void> {
  if (!isProviderAvailable('gdelt')) {
    return;
  }

  try {
    const articles = await gdeltArticles(
      '(NASDAQ OR NYSE OR earnings OR acquisition OR stock market)',
      { maxrecords: 30, timespan: '24h' }
    );

    for (const row of articles) {
      pushHeadline(bucket, {
        title: row.title,
        url: row.url,
        description: row.domain,
        publishedAt: row.seendate,
        source: 'gdelt',
        sourceLabel: row.domain,
        eventTypeHint: 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectGdeltHeadlines' });

  }
}

async function collectFinnhubHeadlines(bucket: Map<string, NewsHeadline>): Promise<void> {
  if (!isProviderAvailable('finnhub')) {
    return;
  }

  try {
    const rows = (await finnhubMarketNews({ category: 'general' })) as Array<{
      headline?: string;
      url?: string;
      summary?: string;
      source?: string;
      datetime?: number;
      category?: string;
    }>;

    for (const row of rows.slice(0, 30)) {
      const publishedAt =
        row.datetime != null
          ? new Date(row.datetime * 1000).toISOString()
          : undefined;

      pushHeadline(bucket, {
        title: String(row.headline ?? ''),
        url: String(row.url ?? ''),
        description: row.summary,
        publishedAt,
        source: 'finnhub',
        sourceLabel: row.source ?? 'Finnhub',
        eventTypeHint: row.category === 'crypto' ? 'market' : 'news',
      });
    }
  } catch (error) {
      logError(error, { source: 'util/events/headlines.ts - collectFinnhubHeadlines' });

  }
}

export async function collectHeadlines(): Promise<NewsHeadline[]> {
  const bucket = new Map<string, NewsHeadline>();

  await Promise.all([
    withSourceTimeout('rss', () => collectRssHeadlines(bucket)),
    withSourceTimeout('gnews', () => collectGnewsHeadlines(bucket)),
    withSourceTimeout('guardian', () => collectGuardianHeadlines(bucket)),
    withSourceTimeout('currentsapi', () => collectCurrentsHeadlines(bucket)),
    withSourceTimeout('gdelt', () => collectGdeltHeadlines(bucket)),
    withSourceTimeout('finnhub', () => collectFinnhubHeadlines(bucket)),
  ]);

  return Array.from(bucket.values()).slice(0, MAX_HEADLINES);
}
