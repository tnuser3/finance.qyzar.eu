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
  name: 'reddit_search',
  description: 'Search Reddit posts across subreddits for finance and market sentiment.',
  category: 'reddit',
  tags: ['reddit', 'social', 'sentiment', 'discussion'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'subreddit', type: 'string', description: 'Restrict to subreddit, e.g. stocks' },
    { name: 'sort', type: 'string', description: 'relevance, hot, top, new, or comments' },
    { name: 'time', type: 'string', description: 'hour, day, week, month, year, or all' },
    { name: 'limit', type: 'number', description: 'Max posts (default 25)' },
  ],
  handler: async (params) =>
    searchPosts({
      query: String(params.query ?? ''),
      subreddit: params.subreddit ? String(params.subreddit) : undefined,
      sort: params.sort ? (String(params.sort) as 'relevance') : undefined,
      time: params.time ? (String(params.time) as 'week') : undefined,
      limit: params.limit ? Number(params.limit) : 25,
    }),
})

register({
  name: 'reddit_subreddit_posts',
  description: 'Get hot/new/top posts from a specific subreddit.',
  category: 'reddit',
  tags: ['reddit', 'social', 'subreddit'],
  parameters: [
    { name: 'subreddit', type: 'string', description: 'Subreddit name, e.g. wallstreetbets', required: true },
    { name: 'sort', type: 'string', description: 'hot, new, top, or rising' },
    { name: 'limit', type: 'number', description: 'Max posts (default 25)' },
    { name: 'time', type: 'string', description: 'For top sort: hour, day, week, month, year, all' },
  ],
  handler: async (params) =>
    getSubredditPosts({
      subreddit: String(params.subreddit ?? ''),
      sort: params.sort ? (String(params.sort) as 'hot') : undefined,
      limit: params.limit ? Number(params.limit) : 25,
      time: params.time ? (String(params.time) as 'week') : undefined,
    }),
})

register({
  name: 'reddit_post_comments',
  description: 'Fetch comments for a Reddit post in a subreddit.',
  category: 'reddit',
  tags: ['reddit', 'comments', 'discussion'],
  parameters: [
    { name: 'subreddit', type: 'string', description: 'Subreddit name', required: true },
    { name: 'postId', type: 'string', description: 'Reddit post ID', required: true },
    { name: 'limit', type: 'number', description: 'Max comments (default 50)' },
    { name: 'sort', type: 'string', description: 'best, top, or new' },
  ],
  handler: async (params) =>
    getPostComments(String(params.subreddit ?? ''), String(params.postId ?? ''), {
      limit: params.limit ? Number(params.limit) : 50,
      sort: params.sort ? (String(params.sort) as 'best') : undefined,
    }),
})

register({
  name: 'googletrends_interest_over_time',
  description: 'Get Google Trends search interest over time for a keyword.',
  category: 'googletrends',
  tags: ['trends', 'search', 'sentiment', 'macro'],
  parameters: [
    { name: 'keyword', type: 'string', description: 'Search term, e.g. inflation or NVIDIA', required: true },
    { name: 'geo', type: 'string', description: 'Geo code, e.g. US, GB, or empty for worldwide' },
    { name: 'time', type: 'string', description: 'e.g. today 12-m, today 3-m, now 7-d' },
  ],
  handler: async (params) =>
    interestOverTime({
      keyword: String(params.keyword ?? ''),
      geo: params.geo ? String(params.geo) : undefined,
      time: params.time ? (String(params.time) as 'today 12-m') : undefined,
    }),
})

register({
  name: 'googletrends_interest_by_region',
  description: 'Get Google Trends interest breakdown by region for a keyword.',
  category: 'googletrends',
  tags: ['trends', 'geo', 'search'],
  parameters: [
    { name: 'keyword', type: 'string', description: 'Search term', required: true },
    { name: 'geo', type: 'string', description: 'Geo filter, e.g. US' },
    { name: 'time', type: 'string', description: 'e.g. today 12-m' },
  ],
  handler: async (params) =>
    interestByRegion({
      keyword: String(params.keyword ?? ''),
      geo: params.geo ? String(params.geo) : undefined,
      time: params.time ? (String(params.time) as 'today 12-m') : undefined,
    }),
})

register({
  name: 'googletrends_related_queries',
  description: 'Get rising and top related Google Trends queries for a keyword.',
  category: 'googletrends',
  tags: ['trends', 'search', 'related'],
  parameters: [
    { name: 'keyword', type: 'string', description: 'Search term', required: true },
    { name: 'geo', type: 'string', description: 'Geo code, e.g. US' },
    { name: 'time', type: 'string', description: 'e.g. today 12-m' },
  ],
  handler: async (params) =>
    relatedQueries({
      keyword: String(params.keyword ?? ''),
      geo: params.geo ? String(params.geo) : undefined,
      time: params.time ? (String(params.time) as 'today 12-m') : undefined,
    }),
})
