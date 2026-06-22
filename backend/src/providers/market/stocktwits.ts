import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://api.stocktwits.com/api/2';

export type StockTwitsOptions = CacheOptions;

function getClientId(): string | undefined {
  return process.env.STOCKTWITS_CLIENT_ID ?? process.env.stocktwits_client_id;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('stocktwits', url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`StockTwits request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export async function symbolStream(
  symbol: string,
  options: StockTwitsOptions = {}
): Promise<Record<string, unknown>> {
  const ticker = symbol.trim().toUpperCase();

  if (!ticker) {
    throw new Error('symbol is required');
  }

  const url = `${API_BASE}/streams/symbol/${ticker}.json`;
  const key = `stocktwits:stream:${ticker}`;

  return cached(key, () => fetchJson(url), options);
}

export async function symbolSentiment(
  symbol: string,
  options: StockTwitsOptions = {}
): Promise<Record<string, unknown>> {
  const ticker = symbol.trim().toUpperCase();

  if (!ticker) {
    throw new Error('symbol is required');
  }

  const url = `${API_BASE}/streams/symbol/${ticker}.json?filter=all`;
  const key = `stocktwits:sentiment:${ticker}`;

  const data = await cached(key, () => fetchJson<Record<string, unknown>>(url), options);

  const messages = (data.messages as Array<{ entities?: { sentiment?: { basic?: string } } }>) ?? [];
  let bullish = 0;
  let bearish = 0;

  for (const msg of messages) {
    const sentiment = msg.entities?.sentiment?.basic;
    if (sentiment === 'Bullish') bullish++;
    else if (sentiment === 'Bearish') bearish++;
  }

  const total = bullish + bearish;
  const score = total > 0 ? Math.round((bullish / total) * 100) : 50;

  return { symbol: ticker, bullish, bearish, sentiment_score: score, messages: messages.slice(0, 25) };
}

export function isConfigured(): boolean {
  return Boolean(getClientId());
}
