import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';
import { logError } from '../../infra/db/error-log';

export type GoogleTrendsTime =
  | 'now 1-H'
  | 'now 4-H'
  | 'now 1-d'
  | 'now 7-d'
  | 'today 1-m'
  | 'today 3-m'
  | 'today 12-m'
  | 'today 5-y'
  | 'all';

export interface GoogleTrendsParams {
  keyword: string;
  geo?: string;
  time?: GoogleTrendsTime;
}

export type GoogleTrendsOptions = CacheOptions;

const TRENDS_BASE = 'https://trends.google.com/trends/api';
const SERPAPI_BASE = 'https://serpapi.com/search.json';

function stripTrendsPrefix(text: string): string {
  const start = text.indexOf('{');
  return start >= 0 ? text.slice(start) : text;
}

function getSerpApiKey(): string | undefined {
  return (
    process.env.SERPAPI_API_KEY ??
    process.env.serpapi_api_key ??
    process.env.serp_api_key
  );
}

async function fetchTrendsJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const url = `${TRENDS_BASE}/${path}?${params}`;
  const res = await apiFetch('googletrends', url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Google Trends request failed (${res.status})`);
  }

  const text = await res.text();
  return JSON.parse(stripTrendsPrefix(text)) as T;
}

interface TrendsWidget {
  id: string;
  token: string;
  request: Record<string, unknown>;
}

async function getExploreWidgets(
  keyword: string,
  geo: string,
  time: GoogleTrendsTime
): Promise<TrendsWidget[]> {
  const req = {
    comparisonItem: [{ keyword, geo, time }],
    category: 0,
    property: '',
  };

  const params = new URLSearchParams({
    hl: 'en-US',
    tz: '300',
    req: JSON.stringify(req),
  });

  const data = await fetchTrendsJson<{ widgets?: TrendsWidget[] }>(
    'explore',
    params
  );

  return data.widgets ?? [];
}

async function fetchWidgetData<T>(
  widget: TrendsWidget
): Promise<T> {
  const params = new URLSearchParams({
    hl: 'en-US',
    tz: '300',
    req: JSON.stringify(widget.request),
    token: widget.token,
  });

  return fetchTrendsJson<T>('widgetdata/multiline', params);
}

async function interestOverTimeDirect(
  params: GoogleTrendsParams
): Promise<Record<string, unknown>> {
  const keyword = params.keyword.trim();
  const geo = params.geo ?? 'US';
  const time = params.time ?? 'today 12-m';

  if (!keyword) {
    throw new Error('keyword is required');
  }

  const widgets = await getExploreWidgets(keyword, geo, time);
  const timeseries = widgets.find((widget) => widget.id === 'TIMESERIES');

  if (!timeseries) {
    throw new Error('Google Trends TIMESERIES widget not found');
  }

  const data = await fetchWidgetData<Record<string, unknown>>(timeseries);

  return {
    keyword,
    geo,
    time,
    source: 'google_trends_unofficial',
    data,
  };
}

async function interestOverTimeSerp(
  params: GoogleTrendsParams,
  apiKey: string
): Promise<Record<string, unknown>> {
  const search = new URLSearchParams({
    engine: 'google_trends',
    q: params.keyword,
    api_key: apiKey,
    data_type: 'TIMESERIES',
    ...(params.geo ? { geo: params.geo } : {}),
    ...(params.time ? { date: params.time } : {}),
  });

  const res = await apiFetch('serpapi', `${SERPAPI_BASE}?${search}`);

  if (!res.ok) {
    throw new Error(`SerpAPI Google Trends failed (${res.status})`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  return {
    keyword: params.keyword,
    geo: params.geo ?? 'US',
    time: params.time ?? 'today 12-m',
    source: 'serpapi',
    data,
  };
}

export async function interestOverTime(
  params: GoogleTrendsParams & GoogleTrendsOptions = { keyword: '' }
): Promise<Record<string, unknown>> {
  const { bypassCache, keyword, geo, time } = params;

  if (!keyword.trim()) {
    throw new Error('keyword is required');
  }

  const cacheKey = `googletrends:interest:${keyword}:${geo ?? 'US'}:${time ?? 'today 12-m'}`;
  const serpKey = getSerpApiKey();

  return cached(
    cacheKey,
    async () => {
      if (serpKey) {
        try {
          return await interestOverTimeSerp(
            { keyword, geo, time },
            serpKey
          );
        } catch (error) {
      logError(error, { source: 'util/googletrends.ts - interestOverTime' });

        }
      }

      return interestOverTimeDirect({ keyword, geo, time });
    },
    { bypassCache }
  );
}

export async function interestByRegion(
  params: GoogleTrendsParams & GoogleTrendsOptions = { keyword: '' }
): Promise<Record<string, unknown>> {
  const { bypassCache, keyword, geo = '', time = 'today 12-m' } = params;

  if (!keyword.trim()) {
    throw new Error('keyword is required');
  }

  const cacheKey = `googletrends:region:${keyword}:${geo}:${time}`;

  return cached(
    cacheKey,
    async () => {
      const widgets = await getExploreWidgets(keyword, geo, time);
      const geoMap = widgets.find((widget) => widget.id === 'GEO_MAP');

      if (!geoMap) {
        throw new Error('Google Trends GEO_MAP widget not found');
      }

      const data = await fetchWidgetData<Record<string, unknown>>(geoMap);

      return {
        keyword,
        geo,
        time,
        source: 'google_trends_unofficial',
        data,
      };
    },
    { bypassCache }
  );
}

export async function relatedQueries(
  params: GoogleTrendsParams & GoogleTrendsOptions = { keyword: '' }
): Promise<Record<string, unknown>> {
  const { bypassCache, keyword, geo = 'US', time = 'today 12-m' } = params;

  if (!keyword.trim()) {
    throw new Error('keyword is required');
  }

  const cacheKey = `googletrends:related:${keyword}:${geo}:${time}`;
  const serpKey = getSerpApiKey();

  return cached(
    cacheKey,
    async () => {
      if (serpKey) {
        const search = new URLSearchParams({
          engine: 'google_trends',
          q: keyword,
          api_key: serpKey,
          data_type: 'RELATED_QUERIES',
          ...(geo ? { geo } : {}),
          ...(time ? { date: time } : {}),
        });

        const res = await apiFetch('serpapi', `${SERPAPI_BASE}?${search}`);

        if (res.ok) {
          return {
            keyword,
            geo,
            time,
            source: 'serpapi',
            data: await res.json(),
          };
        }
      }

      const widgets = await getExploreWidgets(keyword, geo, time);
      const related = widgets.find((widget) => widget.id === 'RELATED_QUERIES');

      if (!related) {
        throw new Error('Google Trends RELATED_QUERIES widget not found');
      }

      const data = await fetchWidgetData<Record<string, unknown>>(related);

      return {
        keyword,
        geo,
        time,
        source: 'google_trends_unofficial',
        data,
      };
    },
    { bypassCache }
  );
}
