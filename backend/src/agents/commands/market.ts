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
  name: 'alphavantage_global_quote',
  description: 'Get the latest stock quote for a ticker symbol.',
  category: 'alphavantage',
  tags: ['stock', 'quote', 'price', 'market'],
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Ticker symbol, e.g. AAPL or IBM',
      required: true,
    },
  ],
  handler: async (params) => {
    const symbol = String(params.symbol ?? '').trim();

    if (!symbol) {
      throw new Error('symbol is required');
    }

    return globalQuote(symbol);
  },
})

register({
  name: 'alphavantage_daily_series',
  description: 'Get daily OHLCV price history for a stock symbol.',
  category: 'alphavantage',
  tags: ['stock', 'history', 'ohlcv', 'chart'],
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Ticker symbol, e.g. MSFT',
      required: true,
    },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact for latest 100 points or full for full history',
    },
  ],
  handler: async (params) => {
    const symbol = String(params.symbol ?? '').trim();

    if (!symbol) {
      throw new Error('symbol is required');
    }

    return dailySeries(symbol, {
      outputsize:
        params.outputsize === 'full' ? 'full' : 'compact',
    });
  },
})

register({
  name: 'alphavantage_symbol_search',
  description: 'Search for stock symbols by company name or keyword.',
  category: 'alphavantage',
  tags: ['stock', 'search', 'symbol'],
  parameters: [
    {
      name: 'keywords',
      type: 'string',
      description: 'Search keywords, e.g. Tesla or Apple',
      required: true,
    },
  ],
  handler: async (params) => {
    const keywords = String(params.keywords ?? '').trim();

    if (!keywords) {
      throw new Error('keywords is required');
    }

    return symbolSearch(keywords);
  },
})

register({
  name: 'alphavantage_company_overview',
  description: 'Get company fundamentals and overview for a ticker.',
  category: 'alphavantage',
  tags: ['stock', 'fundamentals', 'company'],
  parameters: [
    {
      name: 'symbol',
      type: 'string',
      description: 'Ticker symbol, e.g. GOOGL',
      required: true,
    },
  ],
  handler: async (params) => {
    const symbol = String(params.symbol ?? '').trim();

    if (!symbol) {
      throw new Error('symbol is required');
    }

    return companyOverview(symbol);
  },
})

register({
  name: 'alphavantage_news_sentiment',
  description: 'Get market news and sentiment for tickers or topics.',
  category: 'alphavantage',
  tags: ['news', 'sentiment', 'stock', 'market'],
  parameters: [
    {
      name: 'tickers',
      type: 'string',
      description: 'Comma-separated tickers, e.g. AAPL,MSFT',
    },
    {
      name: 'topics',
      type: 'string',
      description: 'News topics such as earnings, technology, or economy',
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum number of articles to return',
    },
  ],
  handler: async (params) => {
    return newsSentiment({
      tickers: params.tickers ? String(params.tickers) : undefined,
      topics: params.topics ? String(params.topics) : undefined,
      limit: params.limit ? Number(params.limit) : 20,
    });
  },
})

register({
  name: 'alphavantage_query',
  description: 'Run a raw Alpha Vantage API function with custom parameters.',
  category: 'alphavantage',
  tags: ['stock', 'market', 'advanced'],
  parameters: [
    {
      name: 'function',
      type: 'string',
      description: 'Alpha Vantage function name, e.g. RSI or FX_DAILY',
      required: true,
    },
    {
      name: 'symbol',
      type: 'string',
      description: 'Optional symbol parameter',
    },
    {
      name: 'interval',
      type: 'string',
      description: 'Optional interval for intraday/indicator endpoints',
    },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact or full',
    },
  ],
  handler: async (params) => {
    const fn = String(params.function ?? '').trim();

    if (!fn) {
      throw new Error('function is required');
    }

    return query({
      function: fn,
      ...(params.symbol ? { symbol: String(params.symbol).toUpperCase() } : {}),
      ...(params.interval ? { interval: String(params.interval) } : {}),
      ...(params.outputsize ? { outputsize: String(params.outputsize) } : {}),
    });
  },
})

register({
  name: 'alphavantage_earnings',
  description: 'Get earnings history and EPS data for a ticker.',
  category: 'alphavantage',
  tags: ['earnings', 'eps', 'fundamentals'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => earnings(String(params.symbol ?? '').trim()),
})

register({
  name: 'alphavantage_income_statement',
  description: 'Get income statement for a ticker.',
  category: 'alphavantage',
  tags: ['earnings', 'fundamentals', 'revenue'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => incomeStatement(String(params.symbol ?? '').trim()),
})

register({
  name: 'alphavantage_balance_sheet',
  description: 'Get balance sheet for a ticker.',
  category: 'alphavantage',
  tags: ['fundamentals', 'debt', 'balance'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => balanceSheet(String(params.symbol ?? '').trim()),
})

register({
  name: 'alphavantage_rsi',
  description: 'Get RSI technical indicator for a ticker.',
  category: 'alphavantage',
  tags: ['technical', 'rsi', 'indicator'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'interval', type: 'string', description: 'daily, weekly, or monthly' },
  ],
  handler: async (params) =>
    rsi(String(params.symbol ?? '').trim(), {
      interval: params.interval ? String(params.interval) : undefined,
    }),
})

register({
  name: 'alphavantage_macd',
  description: 'Get MACD technical indicator for a ticker.',
  category: 'alphavantage',
  tags: ['technical', 'macd', 'indicator'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'interval', type: 'string', description: 'daily, weekly, or monthly' },
  ],
  handler: async (params) =>
    macd(String(params.symbol ?? '').trim(), {
      interval: params.interval ? String(params.interval) : undefined,
    }),
})

register({
  name: 'alphavantage_bbands',
  description: 'Get Bollinger Bands for a ticker.',
  category: 'alphavantage',
  tags: ['technical', 'bollinger', 'indicator'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'interval', type: 'string', description: 'daily, weekly, or monthly' },
  ],
  handler: async (params) =>
    bbands(String(params.symbol ?? '').trim(), {
      interval: params.interval ? String(params.interval) : undefined,
    }),
})

register({
  name: 'fmp_quote',
  description: 'Get the latest stock quote for a ticker symbol (FMP).',
  category: 'fmp',
  tags: ['stock', 'quote', 'price', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. AAPL', required: true },
  ],
  handler: async (params) => fmpQuote(String(params.symbol ?? '').trim()),
})

register({
  name: 'fmp_profile',
  description: 'Get company profile and overview for a ticker (FMP).',
  category: 'fmp',
  tags: ['stock', 'fundamentals', 'company'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => fmpProfile(String(params.symbol ?? '').trim()),
})

register({
  name: 'fmp_search_symbol',
  description: 'Search for stock symbols by ticker or keyword (FMP).',
  category: 'fmp',
  tags: ['stock', 'search', 'symbol'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
  ],
  handler: async (params) => searchSymbol(String(params.query ?? '').trim()),
})

register({
  name: 'fmp_search_name',
  description: 'Search for companies by name (FMP).',
  category: 'fmp',
  tags: ['stock', 'search', 'company'],
  parameters: [
    { name: 'query', type: 'string', description: 'Company name query', required: true },
  ],
  handler: async (params) => searchName(String(params.query ?? '').trim()),
})

register({
  name: 'fmp_historical_prices',
  description: 'Get historical daily OHLCV price history for a ticker (FMP).',
  category: 'fmp',
  tags: ['stock', 'history', 'ohlcv', 'chart'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'from', type: 'string', description: 'Start date YYYY-MM-DD' },
    { name: 'to', type: 'string', description: 'End date YYYY-MM-DD' },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact or full when dates omitted',
    },
  ],
  handler: async (params) =>
    fmpHistoricalPrices(String(params.symbol ?? '').trim(), {
      from: params.from ? String(params.from) : undefined,
      to: params.to ? String(params.to) : undefined,
      outputsize: params.outputsize === 'full' ? 'full' : 'compact',
    }),
})

register({
  name: 'fmp_earnings',
  description: 'Get earnings history for a ticker (FMP).',
  category: 'fmp',
  tags: ['earnings', 'eps', 'fundamentals'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => fmpEarnings(String(params.symbol ?? '').trim()),
})

register({
  name: 'fmp_income_statement',
  description: 'Get income statement for a ticker (FMP).',
  category: 'fmp',
  tags: ['earnings', 'fundamentals', 'revenue'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'period', type: 'string', description: 'annual or quarter (default quarter)' },
  ],
  handler: async (params) =>
    fmpIncomeStatement(String(params.symbol ?? '').trim(), {
      period: params.period === 'annual' ? 'annual' : 'quarter',
    }),
})

register({
  name: 'fmp_balance_sheet',
  description: 'Get balance sheet for a ticker (FMP).',
  category: 'fmp',
  tags: ['fundamentals', 'debt', 'balance'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'period', type: 'string', description: 'annual or quarter (default quarter)' },
  ],
  handler: async (params) =>
    fmpBalanceSheet(String(params.symbol ?? '').trim(), {
      period: params.period === 'annual' ? 'annual' : 'quarter',
    }),
})

register({
  name: 'fmp_cash_flow',
  description: 'Get cash flow statement for a ticker (FMP).',
  category: 'fmp',
  tags: ['fundamentals', 'cash', 'earnings'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'period', type: 'string', description: 'annual or quarter (default quarter)' },
  ],
  handler: async (params) =>
    fmpCashFlow(String(params.symbol ?? '').trim(), {
      period: params.period === 'annual' ? 'annual' : 'quarter',
    }),
})

register({
  name: 'fmp_key_metrics',
  description: 'Get key valuation and financial metrics for a ticker (FMP).',
  category: 'fmp',
  tags: ['fundamentals', 'metrics', 'valuation'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'period', type: 'string', description: 'annual or quarter (default quarter)' },
  ],
  handler: async (params) =>
    keyMetrics(String(params.symbol ?? '').trim(), {
      period: params.period === 'annual' ? 'annual' : 'quarter',
    }),
})

register({
  name: 'fmp_stock_news',
  description: 'Get recent stock news for a ticker (FMP).',
  category: 'fmp',
  tags: ['news', 'stock', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'limit', type: 'number', description: 'Maximum articles (default 20)' },
  ],
  handler: async (params) =>
    fmpStockNews(String(params.symbol ?? '').trim(), {
      limit: params.limit ? Number(params.limit) : 20,
    }),
})

register({
  name: 'fmp_rsi',
  description: 'Get RSI technical indicator for a ticker (FMP).',
  category: 'fmp',
  tags: ['technical', 'rsi', 'indicator'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'periodLength', type: 'number', description: 'RSI period (default 14)' },
    { name: 'timeframe', type: 'string', description: 'Timeframe, e.g. 1day' },
  ],
  handler: async (params) =>
    fmpRsi(String(params.symbol ?? '').trim(), {
      periodLength: params.periodLength ? Number(params.periodLength) : undefined,
      timeframe: params.timeframe ? String(params.timeframe) : undefined,
    }),
})

register({
  name: 'fmp_sma',
  description: 'Get SMA technical indicator for a ticker (FMP).',
  category: 'fmp',
  tags: ['technical', 'sma', 'indicator'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'periodLength', type: 'number', description: 'SMA period (default 20)' },
    { name: 'timeframe', type: 'string', description: 'Timeframe, e.g. 1day' },
  ],
  handler: async (params) =>
    fmpSma(String(params.symbol ?? '').trim(), {
      periodLength: params.periodLength ? Number(params.periodLength) : undefined,
      timeframe: params.timeframe ? String(params.timeframe) : undefined,
    }),
})

register({
  name: 'fmp_request',
  description: 'Run a raw FMP stable API GET request with custom path and params.',
  category: 'fmp',
  tags: ['stock', 'market', 'advanced'],
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'Stable path, e.g. quote or income-statement',
      required: true,
    },
    { name: 'symbol', type: 'string', description: 'Optional symbol parameter' },
    { name: 'query', type: 'string', description: 'Optional query parameter' },
    { name: 'limit', type: 'number', description: 'Optional limit parameter' },
  ],
  handler: async (params) => {
    const path = String(params.path ?? '').trim();

    if (!path) {
      throw new Error('path is required');
    }

    return fmpGet(path, {
      ...(params.symbol ? { symbol: String(params.symbol).toUpperCase() } : {}),
      ...(params.query ? { query: String(params.query) } : {}),
      ...(params.limit ? { limit: Number(params.limit) } : {}),
    });
  },
})

register({
  name: 'finnhub_quote',
  description: 'Get the latest stock quote for a ticker symbol (Finnhub).',
  category: 'finnhub',
  tags: ['stock', 'quote', 'price', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. AAPL', required: true },
  ],
  handler: async (params) => finnhubQuote(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_company_profile',
  description: 'Get company profile and overview for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['stock', 'fundamentals', 'company'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => finnhubCompanyProfile(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_symbol_search',
  description: 'Search for stock symbols by company name or keyword (Finnhub).',
  category: 'finnhub',
  tags: ['stock', 'search', 'symbol'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'exchange', type: 'string', description: 'Exchange filter, e.g. US' },
  ],
  handler: async (params) =>
    finnhubSymbolSearch(String(params.query ?? '').trim(), {
      exchange: params.exchange ? String(params.exchange) : undefined,
    }),
})

register({
  name: 'finnhub_candles',
  description: 'Get OHLCV candle history for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['stock', 'history', 'ohlcv', 'chart', 'technical'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    {
      name: 'resolution',
      type: 'string',
      description: 'Candle resolution: 1, 5, 15, 30, 60, D, W, or M (default D)',
    },
    { name: 'from', type: 'number', description: 'Unix timestamp start' },
    { name: 'to', type: 'number', description: 'Unix timestamp end' },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact (~140 days) or full (~5 years) when from/to omitted',
    },
  ],
  handler: async (params) =>
    finnhubCandles(String(params.symbol ?? '').trim(), {
      resolution: params.resolution ? (String(params.resolution) as 'D') : undefined,
      from: params.from !== undefined ? Number(params.from) : undefined,
      to: params.to !== undefined ? Number(params.to) : undefined,
      outputsize: params.outputsize === 'full' ? 'full' : 'compact',
    }),
})

register({
  name: 'finnhub_company_news',
  description: 'Get recent company news for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['news', 'stock', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'from', type: 'string', description: 'Start date YYYY-MM-DD' },
    { name: 'to', type: 'string', description: 'End date YYYY-MM-DD' },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact (~30 days) or full (~1 year) when from/to omitted',
    },
  ],
  handler: async (params) =>
    finnhubCompanyNews(String(params.symbol ?? '').trim(), {
      from: params.from ? String(params.from) : undefined,
      to: params.to ? String(params.to) : undefined,
      outputsize: params.outputsize === 'full' ? 'full' : 'compact',
    }),
})

register({
  name: 'finnhub_market_news',
  description: 'Get recent market news by category (Finnhub).',
  category: 'finnhub',
  tags: ['news', 'market', 'headline'],
  parameters: [
    {
      name: 'category',
      type: 'string',
      description: 'News category: general, forex, crypto, or merger (default general)',
    },
    { name: 'minId', type: 'number', description: 'Minimum news ID for pagination' },
  ],
  handler: async (params) =>
    finnhubMarketNews({
      category: params.category
        ? (String(params.category) as 'general')
        : undefined,
      minId: params.minId !== undefined ? Number(params.minId) : undefined,
    }),
})

register({
  name: 'finnhub_earnings',
  description: 'Get earnings history for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['earnings', 'eps', 'fundamentals'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => finnhubEarnings(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_basic_financials',
  description: 'Get basic financial metrics for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['fundamentals', 'metrics', 'valuation'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'metric', type: 'string', description: 'Metric group, default all' },
  ],
  handler: async (params) =>
    finnhubBasicFinancials(String(params.symbol ?? '').trim(), {
      metric: params.metric ? String(params.metric) : undefined,
    }),
})

register({
  name: 'finnhub_recommendations',
  description: 'Get analyst recommendation trends for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['fundamentals', 'analyst', 'recommendation'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => finnhubRecommendations(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_peers',
  description: 'Get peer companies for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['stock', 'fundamentals', 'company'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => finnhubPeers(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_insider_transactions',
  description: 'Get insider transaction history for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['insider', 'fundamentals', 'stock'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => finnhubInsiderTransactions(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_price_target',
  description: 'Get analyst price target consensus for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['fundamentals', 'analyst', 'valuation'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => finnhubPriceTarget(String(params.symbol ?? '').trim()),
})

register({
  name: 'finnhub_social_sentiment',
  description: 'Get social media sentiment for a ticker (Finnhub).',
  category: 'finnhub',
  tags: ['sentiment', 'social', 'stock'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'from', type: 'string', description: 'Start date YYYY-MM-DD' },
    { name: 'to', type: 'string', description: 'End date YYYY-MM-DD' },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact (~30 days) or full (~1 year) when from/to omitted',
    },
  ],
  handler: async (params) =>
    finnhubSocialSentiment(String(params.symbol ?? '').trim(), {
      from: params.from ? String(params.from) : undefined,
      to: params.to ? String(params.to) : undefined,
      outputsize: params.outputsize === 'full' ? 'full' : 'compact',
    }),
})

register({
  name: 'finnhub_request',
  description: 'Run a raw Finnhub API GET request with custom path and params.',
  category: 'finnhub',
  tags: ['stock', 'market', 'advanced'],
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'API path, e.g. /stock/dividend or /stock/filings',
      required: true,
    },
    { name: 'symbol', type: 'string', description: 'Ticker symbol when applicable' },
    { name: 'query', type: 'string', description: 'Search query when applicable' },
    { name: 'from', type: 'string', description: 'Date or timestamp parameter' },
    { name: 'to', type: 'string', description: 'Date or timestamp parameter' },
  ],
  handler: async (params) => {
    const path = String(params.path ?? '').trim();

    if (!path) {
      throw new Error('path is required');
    }

    return finnhubGet(path, {
      ...(params.symbol ? { symbol: String(params.symbol).toUpperCase() } : {}),
      ...(params.query ? { q: String(params.query) } : {}),
      ...(params.from ? { from: String(params.from) } : {}),
      ...(params.to ? { to: String(params.to) } : {}),
    });
  },
})

register({
  name: 'massive_snapshot',
  description: 'Get the latest market snapshot for a US stock ticker (Massive/Polygon).',
  category: 'massive',
  tags: ['stock', 'quote', 'price', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. AAPL', required: true },
  ],
  handler: async (params) => snapshot(String(params.symbol ?? '').trim()),
})

register({
  name: 'massive_previous_close',
  description: 'Get the previous close bar for a ticker (Massive/Polygon).',
  category: 'massive',
  tags: ['stock', 'quote', 'price', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => previousClose(String(params.symbol ?? '').trim()),
})

register({
  name: 'massive_aggregates',
  description: 'Get OHLCV aggregate bars for a ticker (Massive/Polygon).',
  category: 'massive',
  tags: ['stock', 'history', 'ohlcv', 'chart', 'technical'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'from', type: 'string', description: 'Start date YYYY-MM-DD' },
    { name: 'to', type: 'string', description: 'End date YYYY-MM-DD' },
    {
      name: 'timespan',
      type: 'string',
      description: 'minute, hour, day, week, month, quarter, or year',
    },
    { name: 'multiplier', type: 'number', description: 'Timespan multiplier (default 1)' },
    {
      name: 'outputsize',
      type: 'string',
      description: 'compact or full when dates omitted',
    },
  ],
  handler: async (params) =>
    aggregates(String(params.symbol ?? '').trim(), {
      from: params.from ? String(params.from) : undefined,
      to: params.to ? String(params.to) : undefined,
      multiplier: params.multiplier ? Number(params.multiplier) : undefined,
      timespan: params.timespan ? (String(params.timespan) as 'day') : undefined,
      outputsize: params.outputsize === 'full' ? 'full' : 'compact',
    }),
})

register({
  name: 'massive_ticker_search',
  description: 'Search for tickers by keyword (Massive/Polygon).',
  category: 'massive',
  tags: ['stock', 'search', 'symbol'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'limit', type: 'number', description: 'Maximum results (default 10)' },
  ],
  handler: async (params) =>
    tickerSearch(String(params.query ?? '').trim(), {
      limit: params.limit ? Number(params.limit) : 10,
    }),
})

register({
  name: 'massive_ticker_details',
  description: 'Get reference details for a ticker (Massive/Polygon).',
  category: 'massive',
  tags: ['stock', 'fundamentals', 'company'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
  ],
  handler: async (params) => tickerDetails(String(params.symbol ?? '').trim()),
})

register({
  name: 'massive_news',
  description: 'Get recent news for a ticker with sentiment (Massive/Polygon).',
  category: 'massive',
  tags: ['news', 'sentiment', 'stock', 'market'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'limit', type: 'number', description: 'Maximum articles (default 20)' },
  ],
  handler: async (params) =>
    massiveNews(String(params.symbol ?? '').trim(), {
      limit: params.limit ? Number(params.limit) : 20,
    }),
})

register({
  name: 'massive_financials',
  description: 'Get financial statements for a ticker (Massive/Polygon).',
  category: 'massive',
  tags: ['fundamentals', 'earnings', 'balance'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol', required: true },
    { name: 'limit', type: 'number', description: 'Maximum filings (default 10)' },
  ],
  handler: async (params) =>
    massiveFinancials(String(params.symbol ?? '').trim(), {
      limit: params.limit ? Number(params.limit) : 10,
    }),
})

register({
  name: 'massive_request',
  description: 'Run a raw Massive/Polygon API GET request with custom path and params.',
  category: 'massive',
  tags: ['stock', 'market', 'advanced'],
  parameters: [
    {
      name: 'path',
      type: 'string',
      description: 'API path, e.g. /v2/reference/news',
      required: true,
    },
    { name: 'ticker', type: 'string', description: 'Optional ticker query parameter' },
    { name: 'limit', type: 'number', description: 'Optional limit query parameter' },
  ],
  handler: async (params) => {
    const path = String(params.path ?? '').trim();

    if (!path) {
      throw new Error('path is required');
    }

    return massiveGet(path, {
      ...(params.ticker ? { ticker: String(params.ticker).toUpperCase() } : {}),
      ...(params.limit ? { limit: Number(params.limit) } : {}),
    });
  },
})

register({
  name: 'stocktwits_symbol_stream',
  description: 'Fetch recent StockTwits messages for a ticker symbol.',
  category: 'stocktwits',
  tags: ['stocktwits', 'social', 'sentiment', 'ticker'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. NVDA', required: true },
  ],
  handler: async (params) =>
    symbolStream(String(params.symbol ?? '')),
})

register({
  name: 'stocktwits_symbol_sentiment',
  description: 'Compute bullish/bearish sentiment score from StockTwits messages.',
  category: 'stocktwits',
  tags: ['stocktwits', 'social', 'sentiment', 'ticker'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. NVDA', required: true },
  ],
  handler: async (params) =>
    symbolSentiment(String(params.symbol ?? '')),
})

register({
  name: 'coingecko_price',
  description:
    'Get current cryptocurrency price(s) in USD or another fiat currency (CoinGecko). Use for BTC, ETH, SOL, and other crypto — not stock tickers.',
  category: 'coingecko',
  tags: ['crypto', 'price', 'quote', 'bitcoin', 'ethereum'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. BTC or ETH' },
    { name: 'id', type: 'string', description: 'CoinGecko coin id, e.g. bitcoin or ethereum' },
    {
      name: 'ids',
      type: 'array',
      description: 'Multiple symbols or coin ids, e.g. ["BTC","ETH","SOL"]',
    },
    { name: 'vs_currency', type: 'string', description: 'Quote currency (default usd)' },
  ],
  handler: async (params) => {
    const ids = Array.isArray(params.ids)
      ? params.ids.map((value) => String(value))
      : undefined;

    return coingeckoPrice({
      symbol: params.symbol ? String(params.symbol) : undefined,
      id: params.id ? String(params.id) : undefined,
      ids,
      vs_currency: params.vs_currency ? String(params.vs_currency) : undefined,
    });
  },
})

register({
  name: 'coingecko_search',
  description: 'Search cryptocurrencies by name or symbol (CoinGecko).',
  category: 'coingecko',
  tags: ['crypto', 'search', 'coin'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search query, e.g. solana or LINK', required: true },
  ],
  handler: async (params) => coingeckoSearch(String(params.query ?? '').trim()),
})

register({
  name: 'coingecko_coin',
  description: 'Get detailed metadata and market stats for a cryptocurrency (CoinGecko).',
  category: 'coingecko',
  tags: ['crypto', 'fundamentals', 'coin'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. BTC' },
    { name: 'id', type: 'string', description: 'CoinGecko coin id, e.g. bitcoin' },
  ],
  handler: async (params) =>
    coingeckoCoin({
      symbol: params.symbol ? String(params.symbol) : undefined,
      id: params.id ? String(params.id) : undefined,
    }),
})

register({
  name: 'coingecko_markets',
  description: 'List top cryptocurrencies ranked by market cap (CoinGecko).',
  category: 'coingecko',
  tags: ['crypto', 'market', 'ranking', 'price'],
  parameters: [
    { name: 'vs_currency', type: 'string', description: 'Quote currency (default usd)' },
    { name: 'per_page', type: 'number', description: 'Results per page (default 50, max 250)' },
    { name: 'page', type: 'number', description: 'Page number (default 1)' },
    {
      name: 'order',
      type: 'string',
      description: 'Sort order, e.g. market_cap_desc or volume_desc',
    },
  ],
  handler: async (params) =>
    coingeckoMarkets({
      vs_currency: params.vs_currency ? String(params.vs_currency) : undefined,
      per_page: params.per_page !== undefined ? Number(params.per_page) : undefined,
      page: params.page !== undefined ? Number(params.page) : undefined,
      order: params.order ? String(params.order) : undefined,
    }),
})

register({
  name: 'coingecko_market_chart',
  description: 'Get historical price/volume/market-cap series for a cryptocurrency (CoinGecko).',
  category: 'coingecko',
  tags: ['crypto', 'history', 'chart', 'price'],
  parameters: [
    { name: 'symbol', type: 'string', description: 'Ticker symbol, e.g. BTC' },
    { name: 'id', type: 'string', description: 'CoinGecko coin id, e.g. bitcoin' },
    { name: 'days', type: 'number', description: 'Lookback days (default 30). Use max for full history.' },
    { name: 'vs_currency', type: 'string', description: 'Quote currency (default usd)' },
    { name: 'interval', type: 'string', description: 'Optional interval: daily or hourly' },
  ],
  handler: async (params) =>
    coingeckoMarketChart({
      symbol: params.symbol ? String(params.symbol) : undefined,
      id: params.id ? String(params.id) : undefined,
      days: params.days !== undefined ? Number(params.days) : undefined,
      vs_currency: params.vs_currency ? String(params.vs_currency) : undefined,
      interval: params.interval ? String(params.interval) : undefined,
    }),
})

register({
  name: 'coingecko_trending',
  description: 'Get currently trending cryptocurrencies on CoinGecko.',
  category: 'coingecko',
  tags: ['crypto', 'trending', 'market', 'sentiment'],
  parameters: [],
  handler: async () => coingeckoTrending(),
})

register({
  name: 'coingecko_request',
  description: 'Run a raw CoinGecko API GET request with custom path and query params.',
  category: 'coingecko',
  tags: ['crypto', 'advanced'],
  parameters: [
    { name: 'path', type: 'string', description: 'API path, e.g. /coins/bitcoin', required: true },
    {
      name: 'params',
      type: 'object',
      description: 'Optional query parameters as key/value pairs',
    },
  ],
  handler: async (params) => {
    const path = String(params.path ?? '').trim();
    const queryParams =
      params.params && typeof params.params === 'object'
        ? (params.params as Record<string, string | number | boolean>)
        : {};

    return coingeckoGet(path, queryParams);
  },
})
