import { cached, type CacheOptions } from '../../../infra/db/cache';
import { apiFetch } from '../../../infra/http/fetch';
import { logError } from '../../../infra/db/error-log';
import {
  getFeedById,
  listFeeds,
  type FeedTier,
  type RssFeedDefinition,
} from './feeds';

export type RssOptions = CacheOptions;

export interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

export interface RssFeedResult {
  feed: Pick<RssFeedDefinition, 'id' | 'name' | 'source' | 'url' | 'tier' | 'region'>;
  items: RssItem[];
  fetchedAt: string;
  error?: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const pattern = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i'
  );
  const match = block.match(pattern);
  return match?.[1] ? decodeXmlEntities(match[1]) : undefined;
}

function extractAtomLink(block: string): string | undefined {
  const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  return hrefMatch?.[1];
}

function parseFeedXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const rssBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const atomBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  const blocks = rssBlocks.length ? rssBlocks : atomBlocks;

  for (const block of blocks) {
    const title = extractTag(block, 'title');
    const link =
      extractTag(block, 'link') ?? extractAtomLink(block) ?? extractTag(block, 'id');
    const description =
      extractTag(block, 'description') ??
      extractTag(block, 'summary') ??
      extractTag(block, 'content');
    const pubDate =
      extractTag(block, 'pubDate') ?? extractTag(block, 'published') ?? extractTag(block, 'updated');
    const guid = extractTag(block, 'guid') ?? extractTag(block, 'id');

    if (title && link) {
      items.push({
        title,
        link,
        description,
        pubDate,
        guid,
      });
    }
  }

  return items;
}

async function fetchFeedXml(url: string): Promise<string> {
  const res = await apiFetch('rss', url, {
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      'User-Agent': 'finance3-research-bot/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed (${res.status}) for ${url}`);
  }

  return res.text();
}

function toFeedMeta(feed: RssFeedDefinition) {
  return {
    id: feed.id,
    name: feed.name,
    source: feed.source,
    url: feed.url,
    tier: feed.tier,
    region: feed.region,
  };
}

export async function fetchFeed(
  feedIdOrUrl: string,
  options: RssOptions & { limit?: number } = {}
): Promise<RssFeedResult> {
  const { bypassCache, limit = 25 } = options;
  const feed =
    getFeedById(feedIdOrUrl) ??
    ({
      id: 'custom',
      name: 'Custom Feed',
      source: 'custom',
      url: feedIdOrUrl,
      tier: 2 as FeedTier,
      region: 'us',
      tags: [],
    } satisfies RssFeedDefinition);

  const url = feed.url.startsWith('http') ? feed.url : feedIdOrUrl;
  const cacheKey = `rss:${url}:${limit}`;

  return cached(
    cacheKey,
    async () => {
      try {
        const xml = await fetchFeedXml(url);
        const items = parseFeedXml(xml).slice(0, limit);

        return {
          feed: toFeedMeta({ ...feed, url }),
          items,
          fetchedAt: new Date().toISOString(),
        };
      } catch (error) {
      logError(error, { source: 'util/rss.ts - fetchFeed' });
        return {
          feed: toFeedMeta({ ...feed, url }),
          items: [],
          fetchedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'RSS fetch failed',
        };
      }
    },
    { bypassCache }
  );
}

export async function fetchBySource(
  source: string,
  options: RssOptions & { limitPerFeed?: number } = {}
): Promise<RssFeedResult[]> {
  const feeds = listFeeds({ source });
  const limitPerFeed = options.limitPerFeed ?? 10;

  return Promise.all(
    feeds.map((feed) => fetchFeed(feed.id, { ...options, limit: limitPerFeed }))
  );
}

export async function fetchByTier(
  tier: FeedTier,
  options: RssOptions & { limitPerFeed?: number } = {}
): Promise<RssFeedResult[]> {
  const feeds = listFeeds({ tier });
  const limitPerFeed = options.limitPerFeed ?? 8;

  return Promise.all(
    feeds.map((feed) => fetchFeed(feed.id, { ...options, limit: limitPerFeed }))
  );
}

export async function searchFeedItems(
  query: string,
  options: RssOptions & {
    tier?: FeedTier;
    source?: string;
    limitPerFeed?: number;
    maxFeeds?: number;
  } = {}
): Promise<Array<RssItem & { feedId: string; feedName: string; source: string }>> {
  const feeds = listFeeds({
    tier: options.tier,
    source: options.source,
    query,
  }).slice(0, options.maxFeeds ?? 12);

  const needle = query.toLowerCase();
  const results: Array<RssItem & { feedId: string; feedName: string; source: string }> =
    [];

  for (const feed of feeds) {
    const fetched = await fetchFeed(feed.id, {
      bypassCache: options.bypassCache,
      limit: options.limitPerFeed ?? 15,
    });

    for (const item of fetched.items) {
      const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase();

      if (haystack.includes(needle)) {
        results.push({
          ...item,
          feedId: feed.id,
          feedName: feed.name,
          source: feed.source,
        });
      }
    }
  }

  return results;
}

export { listFeeds, getFeedById };
