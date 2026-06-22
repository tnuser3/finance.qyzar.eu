import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const OAUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';

export type RedditSort = 'relevance' | 'hot' | 'top' | 'new' | 'comments';
export type RedditTime = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

export interface RedditSearchParams {
  query: string;
  subreddit?: string;
  sort?: RedditSort;
  time?: RedditTime;
  limit?: number;
}

export interface RedditSubredditParams {
  subreddit: string;
  sort?: 'hot' | 'new' | 'top' | 'rising';
  limit?: number;
  time?: RedditTime;
}

export type RedditOptions = CacheOptions;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function getClientId(): string {
  const id = process.env.REDDIT_CLIENT_ID ?? process.env.reddit_client_id;

  if (!id) {
    throw new Error('REDDIT_CLIENT_ID (or reddit_client_id) is not set in environment');
  }

  return id;
}

function getClientSecret(): string {
  const secret =
    process.env.REDDIT_CLIENT_SECRET ?? process.env.reddit_client_secret;

  if (!secret) {
    throw new Error(
      'REDDIT_CLIENT_SECRET (or reddit_client_secret) is not set in environment'
    );
  }

  return secret;
}

function getUserAgent(): string {
  return (
    process.env.REDDIT_USER_AGENT ??
    process.env.reddit_user_agent ??
    'finance3-research-bot/1.0 (by /u/finance3)'
  );
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const auth = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString(
    'base64'
  );

  const res = await apiFetch('reddit', OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': getUserAgent(),
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Reddit OAuth failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error('Reddit OAuth response missing access_token');
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return data.access_token;
}

async function redditFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const token = await getAccessToken();
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const url = `${API_BASE}${path}?${search}`;
  const res = await apiFetch('reddit', url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': getUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

function buildCacheKey(endpoint: string, params: Record<string, unknown>): string {
  return `reddit:${endpoint}:${JSON.stringify(params)}`;
}

export async function searchPosts(
  params: RedditSearchParams & RedditOptions = { query: '' }
): Promise<Record<string, unknown>> {
  const { bypassCache, query, subreddit, sort = 'new', time = 'week', limit = 25 } =
    params;

  if (!query.trim()) {
    throw new Error('query is required');
  }

  const cacheKey = buildCacheKey('search', { query, subreddit, sort, time, limit });

  return cached(
    cacheKey,
    () =>
      redditFetch('/search', {
        q: query,
        restrict_sr: subreddit ? 'true' : 'false',
        sort,
        t: time,
        limit: Math.min(100, limit),
        type: 'link',
        ...(subreddit ? { subreddit } : {}),
      }),
    { bypassCache }
  );
}

export async function getSubredditPosts(
  params: RedditSubredditParams & RedditOptions
): Promise<Record<string, unknown>> {
  const {
    bypassCache,
    subreddit,
    sort = 'hot',
    limit = 25,
    time = 'week',
  } = params;

  const name = subreddit.trim().replace(/^r\//, '');

  if (!name) {
    throw new Error('subreddit is required');
  }

  const cacheKey = buildCacheKey('subreddit', { name, sort, limit, time });

  return cached(
    cacheKey,
    () =>
      redditFetch(`/r/${name}/${sort}`, {
        limit: Math.min(100, limit),
        ...(sort === 'top' ? { t: time } : {}),
      }),
    { bypassCache }
  );
}

export async function getPostComments(
  subreddit: string,
  postId: string,
  options: RedditOptions & { limit?: number; sort?: 'best' | 'top' | 'new' } = {}
): Promise<Record<string, unknown>> {
  const name = subreddit.trim().replace(/^r\//, '');
  const id = postId.trim();

  if (!name || !id) {
    throw new Error('subreddit and postId are required');
  }

  const cacheKey = buildCacheKey('comments', {
    name,
    id,
    limit: options.limit,
    sort: options.sort,
  });

  return cached(
    cacheKey,
    () =>
      redditFetch(`/r/${name}/comments/${id}`, {
        limit: options.limit ?? 50,
        sort: options.sort ?? 'best',
      }),
    { bypassCache: options.bypassCache }
  );
}
