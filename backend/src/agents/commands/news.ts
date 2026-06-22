import {
  balanceSheet,
  bbands,
  cashFlow,
  companyOverview,
  dailySeries,
  earnings,
  globalQuote,
  incomeStatement,
  macd,
  newsSentiment,
  query,
  rsi,
  symbolSearch,
} from '../../providers/market/alphavantage';
import {
  balanceSheet as fmpBalanceSheet,
  cashFlow as fmpCashFlow,
  earnings as fmpEarnings,
  get as fmpGet,
  historicalPrices as fmpHistoricalPrices,
  incomeStatement as fmpIncomeStatement,
  keyMetrics,
  profile as fmpProfile,
  quote as fmpQuote,
  rsi as fmpRsi,
  searchName,
  searchSymbol,
  sma as fmpSma,
  stockNews as fmpStockNews,
} from '../../providers/market/fmp';
import {
  basicFinancials as finnhubBasicFinancials,
  candles as finnhubCandles,
  companyNews as finnhubCompanyNews,
  companyProfile as finnhubCompanyProfile,
  earnings as finnhubEarnings,
  get as finnhubGet,
  insiderTransactions as finnhubInsiderTransactions,
  marketNews as finnhubMarketNews,
  peers as finnhubPeers,
  priceTarget as finnhubPriceTarget,
  quote as finnhubQuote,
  recommendations as finnhubRecommendations,
  socialSentiment as finnhubSocialSentiment,
  symbolSearch as finnhubSymbolSearch,
} from '../../providers/market/finnhub';
import {
  aggregates,
  financials as massiveFinancials,
  get as massiveGet,
  news as massiveNews,
  previousClose,
  snapshot,
  tickerDetails,
  tickerSearch,
} from '../../providers/market/massive';
import {
  availableCategories,
  latestNews,
  searchNews,
} from '../../providers/news/currentsapi';
import { articles, doc, geo } from '../../providers/news/gdelt';
import { getItem, search as guardianSearch, sections, tags } from '../../providers/news/guardian';
import {
  interestByRegion,
  interestOverTime,
  relatedQueries,
} from '../../providers/news/googletrends';
import {
  fetchBySource,
  fetchByTier,
  fetchFeed,
  listFeeds,
  searchFeedItems,
} from '../../providers/news/rss/fetch';
import { getPostComments, getSubredditPosts, searchPosts } from '../../providers/news/reddit';
import { symbolSentiment, symbolStream } from '../../providers/market/stocktwits';
import { acs5, query as censusQuery } from '../../providers/gov/census';
import {
  companyConcept,
  companyFacts,
  searchFilings,
  submissions,
} from '../../providers/gov/edgar';
import { search as gnewsSearch, topHeadlines } from '../../providers/news/gnews';
import { listFilings, listRegistrants } from '../../providers/gov/lda';
import { searchSeries, seriesInfo, seriesObservations } from '../../providers/gov/fred';
import {
  autocompleteRecipient,
  listAgencies,
  searchSpendingByAward,
  searchSpendingByGeography,
} from '../../providers/gov/usaspending';
import {
  coin as coingeckoCoin,
  get as coingeckoGet,
  marketChart as coingeckoMarketChart,
  markets as coingeckoMarkets,
  price as coingeckoPrice,
  searchCoins as coingeckoSearch,
  trending as coingeckoTrending,
} from '../../providers/market/coingecko';
import {
  listByCategory,
  listByTag,
  searchCommands,
} from '../runtime/command-index';
import { getAvailablePlatforms } from '../../providers/command-availability';
import { register } from '../runtime/registry';

register({
  name: 'gdelt_search_articles',
  description: 'Search recent global news articles from GDELT by query string.',
  category: 'gdelt',
  tags: ['news', 'articles', 'search'],
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Search query, e.g. "federal reserve" or Apple stock',
      required: true,
    },
    {
      name: 'maxrecords',
      type: 'number',
      description: 'Maximum number of articles to return (default 25)',
    },
    {
      name: 'timespan',
      type: 'string',
      description: 'Lookback window such as 24h, 7d, or 1mo',
    },
  ],
  handler: async (params) => {
    const query = String(params.query ?? '');

    if (!query) {
      throw new Error('query is required');
    }

    return articles(query, {
      maxrecords: params.maxrecords ? Number(params.maxrecords) : 25,
      timespan: params.timespan ? String(params.timespan) : '24h',
    });
  },
})

register({
  name: 'gdelt_timeline_volume',
  description: 'Get GDELT media volume timeline for a topic over a timespan.',
  category: 'gdelt',
  tags: ['news', 'timeline', 'volume'],
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Topic to track, e.g. "inflation" or "oil prices"',
      required: true,
    },
    {
      name: 'timespan',
      type: 'string',
      description: 'Lookback window such as 24h, 7d, or 1mo',
    },
  ],
  handler: async (params) => {
    const query = String(params.query ?? '');

    if (!query) {
      throw new Error('query is required');
    }

    return doc({
      query,
      mode: 'TimelineVol',
      timespan: params.timespan ? String(params.timespan) : '7d',
    });
  },
})

register({
  name: 'gdelt_timeline_tone',
  description: 'Get GDELT media tone/sentiment timeline for a topic.',
  category: 'gdelt',
  tags: ['news', 'timeline', 'tone', 'sentiment'],
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Topic to analyze, e.g. "recession" or Tesla',
      required: true,
    },
    {
      name: 'timespan',
      type: 'string',
      description: 'Lookback window such as 24h, 7d, or 1mo',
    },
  ],
  handler: async (params) => {
    const query = String(params.query ?? '');

    if (!query) {
      throw new Error('query is required');
    }

    return doc({
      query,
      mode: 'TimelineTone',
      timespan: params.timespan ? String(params.timespan) : '7d',
    });
  },
})

register({
  name: 'gdelt_geo_query',
  description: 'Query GDELT geographic news coverage for a topic or location.',
  category: 'gdelt',
  tags: ['news', 'geo', 'map', 'location'],
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Topic or place, e.g. "Ukraine conflict" or "Middle East oil"',
      required: true,
    },
    {
      name: 'mode',
      type: 'string',
      description: 'GEO mode: PointData, Country, or ADM1',
    },
    {
      name: 'timespan',
      type: 'string',
      description: 'Lookback window such as 24h, 7d, or 1mo',
    },
  ],
  handler: async (params) => {
    const query = String(params.query ?? '');

    if (!query) {
      throw new Error('query is required');
    }

    return geo({
      query,
      mode: (params.mode as 'PointData' | 'Country' | 'ADM1') ?? 'PointData',
      timespan: params.timespan ? String(params.timespan) : '7d',
    });
  },
})

register({
  name: 'currentsapi_latest_news',
  description: 'Get the latest global news headlines from Currents API.',
  category: 'currentsapi',
  tags: ['news', 'headlines', 'latest', 'articles'],
  parameters: [
    {
      name: 'language',
      type: 'string',
      description: '2-letter language code, default en',
    },
  ],
  handler: async (params) => {
    return latestNews({
      language: params.language ? String(params.language) : 'en',
    });
  },
})

register({
  name: 'currentsapi_search',
  description: 'Search global news articles by keywords, category, country, or date.',
  category: 'currentsapi',
  tags: ['news', 'search', 'articles', 'headlines'],
  parameters: [
    {
      name: 'keywords',
      type: 'string',
      description: 'Search keywords, e.g. inflation or Apple earnings',
      required: true,
    },
    {
      name: 'language',
      type: 'string',
      description: '2-letter language code, e.g. en',
    },
    {
      name: 'country',
      type: 'string',
      description: '2-letter country code, e.g. US',
    },
    {
      name: 'category',
      type: 'string',
      description: 'Category such as business, finance, technology, or sports',
    },
    {
      name: 'start_date',
      type: 'string',
      description: 'Start date YYYY-MM-DDTHH:MM:SS+00:00',
    },
    {
      name: 'end_date',
      type: 'string',
      description: 'End date YYYY-MM-DDTHH:MM:SS+00:00',
    },
  ],
  handler: async (params) => {
    return searchNews({
      keywords: String(params.keywords ?? ''),
      language: params.language ? String(params.language) : undefined,
      country: params.country ? String(params.country) : undefined,
      category: params.category ? String(params.category) : undefined,
      start_date: params.start_date ? String(params.start_date) : undefined,
      end_date: params.end_date ? String(params.end_date) : undefined,
    });
  },
})

register({
  name: 'currentsapi_categories',
  description: 'List available news categories from Currents API.',
  category: 'currentsapi',
  tags: ['news', 'meta', 'categories'],
  parameters: [],
  handler: async () => availableCategories(),
})

register({
  name: 'guardian_search',
  description: 'Search Guardian articles by keyword, section, tag, or date range.',
  category: 'guardian',
  tags: ['news', 'search', 'articles', 'guardian'],
  parameters: [
    {
      name: 'q',
      type: 'string',
      description: 'Search query, e.g. inflation or climate change',
    },
    {
      name: 'section',
      type: 'string',
      description: 'Guardian section such as politics, business, or technology',
    },
    {
      name: 'tag',
      type: 'string',
      description: 'Guardian tag such as uk/finance or environment/climate-change',
    },
    {
      name: 'from-date',
      type: 'string',
      description: 'Start date YYYY-MM-DD',
    },
    {
      name: 'to-date',
      type: 'string',
      description: 'End date YYYY-MM-DD',
    },
    {
      name: 'page-size',
      type: 'number',
      description: 'Results per page, 1 to 50',
    },
    {
      name: 'order-by',
      type: 'string',
      description: 'newest, oldest, or relevance',
    },
  ],
  handler: async (params) => {
    return guardianSearch({
      q: params.q ? String(params.q) : undefined,
      section: params.section ? String(params.section) : undefined,
      tag: params.tag ? String(params.tag) : undefined,
      'from-date': params['from-date'] ? String(params['from-date']) : undefined,
      'to-date': params['to-date'] ? String(params['to-date']) : undefined,
      'page-size': params['page-size'] ? Number(params['page-size']) : 10,
      'order-by': (params['order-by'] as 'newest' | 'oldest' | 'relevance') ?? 'newest',
    });
  },
})

register({
  name: 'guardian_sections',
  description: 'List Guardian content sections.',
  category: 'guardian',
  tags: ['news', 'meta', 'sections', 'guardian'],
  parameters: [
    {
      name: 'q',
      type: 'string',
      description: 'Optional filter query for sections',
    },
  ],
  handler: async (params) => {
    return sections({
      q: params.q ? String(params.q) : undefined,
    });
  },
})

register({
  name: 'guardian_tags',
  description: 'List or search Guardian content tags.',
  category: 'guardian',
  tags: ['news', 'meta', 'tags', 'guardian'],
  parameters: [
    {
      name: 'q',
      type: 'string',
      description: 'Optional filter query for tags',
    },
    {
      name: 'section',
      type: 'string',
      description: 'Optional section filter',
    },
  ],
  handler: async (params) => {
    return tags({
      q: params.q ? String(params.q) : undefined,
      section: params.section ? String(params.section) : undefined,
    });
  },
})

register({
  name: 'guardian_item',
  description: 'Fetch a single Guardian article by id or path.',
  category: 'guardian',
  tags: ['news', 'article', 'guardian'],
  parameters: [
    {
      name: 'id',
      type: 'string',
      description: 'Guardian article id or path',
      required: true,
    },
  ],
  handler: async (params) => {
    return getItem(String(params.id ?? ''));
  },
})

register({
  name: 'rss_list_feeds',
  description: 'List government, regulatory, and economic RSS feeds by tier, source, or region.',
  category: 'rss',
  tags: ['rss', 'regulatory', 'government', 'feeds'],
  parameters: [
    { name: 'tier', type: 'number', description: 'Priority tier: 1, 2, or 3' },
    { name: 'source', type: 'string', description: 'Source slug, e.g. sec, ftc, federal_reserve' },
    { name: 'region', type: 'string', description: 'us, international_central_banks, international_regulators, politics, economic' },
    { name: 'query', type: 'string', description: 'Filter feeds by keyword in name or tags' },
  ],
  handler: (params) =>
    listFeeds({
      tier: params.tier ? (Number(params.tier) as 1) : undefined,
      source: params.source ? String(params.source) : undefined,
      region: params.region ? (String(params.region) as 'us') : undefined,
      query: params.query ? String(params.query) : undefined,
    }),
})

register({
  name: 'rss_fetch_feed',
  description: 'Fetch items from a single RSS feed by feed id or direct URL.',
  category: 'rss',
  tags: ['rss', 'news', 'regulatory'],
  parameters: [
    { name: 'feedId', type: 'string', description: 'Feed id, e.g. sec_press, fed_press, or a direct RSS URL', required: true },
    { name: 'limit', type: 'number', description: 'Max items (default 25)' },
  ],
  handler: async (params) =>
    fetchFeed(String(params.feedId ?? ''), {
      limit: params.limit ? Number(params.limit) : 25,
    }),
})

register({
  name: 'rss_fetch_source',
  description: 'Fetch recent items from all feeds for a source, e.g. sec or ftc.',
  category: 'rss',
  tags: ['rss', 'regulatory', 'government'],
  parameters: [
    { name: 'source', type: 'string', description: 'Source slug, e.g. sec, doj, federal_reserve', required: true },
    { name: 'limitPerFeed', type: 'number', description: 'Items per feed (default 10)' },
  ],
  handler: async (params) =>
    fetchBySource(String(params.source ?? ''), {
      limitPerFeed: params.limitPerFeed ? Number(params.limitPerFeed) : 10,
    }),
})

register({
  name: 'rss_fetch_tier',
  description: 'Fetch recent items from all feeds in a priority tier (1=must-have, 2, 3).',
  category: 'rss',
  tags: ['rss', 'regulatory', 'tier'],
  parameters: [
    { name: 'tier', type: 'number', description: 'Tier 1, 2, or 3', required: true },
    { name: 'limitPerFeed', type: 'number', description: 'Items per feed (default 8)' },
  ],
  handler: async (params) =>
    fetchByTier(Number(params.tier) as 1, {
      limitPerFeed: params.limitPerFeed ? Number(params.limitPerFeed) : 8,
    }),
})

register({
  name: 'rss_search_items',
  description: 'Search recent RSS items across regulatory and government feeds.',
  category: 'rss',
  tags: ['rss', 'search', 'regulatory', 'enforcement'],
  parameters: [
    { name: 'query', type: 'string', description: 'Keyword to match in titles/descriptions', required: true },
    { name: 'tier', type: 'number', description: 'Limit to tier 1, 2, or 3' },
    { name: 'source', type: 'string', description: 'Limit to source slug' },
    { name: 'maxFeeds', type: 'number', description: 'Max feeds to scan (default 12)' },
  ],
  handler: async (params) =>
    searchFeedItems(String(params.query ?? ''), {
      tier: params.tier ? (Number(params.tier) as 1) : undefined,
      source: params.source ? String(params.source) : undefined,
      maxFeeds: params.maxFeeds ? Number(params.maxFeeds) : 12,
    }),
})

register({
  name: 'gnews_search',
  description: 'Search news articles via GNews across 80,000+ sources.',
  category: 'gnews',
  tags: ['news', 'headlines', 'search'],
  parameters: [
    { name: 'q', type: 'string', description: 'Search query', required: true },
    { name: 'lang', type: 'string', description: 'Language code, e.g. en' },
    { name: 'country', type: 'string', description: 'Country code, e.g. us' },
    { name: 'max', type: 'number', description: 'Max articles (default 10)' },
    { name: 'from', type: 'string', description: 'Start date ISO 8601' },
    { name: 'to', type: 'string', description: 'End date ISO 8601' },
  ],
  handler: async (params) =>
    gnewsSearch({
      q: String(params.q ?? ''),
      lang: params.lang ? String(params.lang) : undefined,
      country: params.country ? String(params.country) : undefined,
      max: params.max ? Number(params.max) : 10,
      from: params.from ? String(params.from) : undefined,
      to: params.to ? String(params.to) : undefined,
    }),
})

register({
  name: 'gnews_top_headlines',
  description: 'Get top/trending news headlines by category from GNews.',
  category: 'gnews',
  tags: ['news', 'headlines', 'trending'],
  parameters: [
    { name: 'category', type: 'string', description: 'general, business, technology, science, etc.' },
    { name: 'q', type: 'string', description: 'Optional keyword filter' },
    { name: 'lang', type: 'string', description: 'Language code' },
    { name: 'country', type: 'string', description: 'Country code' },
    { name: 'max', type: 'number', description: 'Max articles (default 10)' },
  ],
  handler: async (params) =>
    topHeadlines({
      category: params.category ? (String(params.category) as 'business') : undefined,
      q: params.q ? String(params.q) : undefined,
      lang: params.lang ? String(params.lang) : undefined,
      country: params.country ? String(params.country) : undefined,
      max: params.max ? Number(params.max) : 10,
    }),
})
