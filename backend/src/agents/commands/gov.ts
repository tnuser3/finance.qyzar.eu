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
  name: 'fred_search_series',
  description: 'Search FRED economic data series by keyword (GDP, CPI, unemployment, etc.).',
  category: 'fred',
  tags: ['fred', 'macro', 'economic', 'gdp', 'inflation'],
  parameters: [
    { name: 'search_text', type: 'string', description: 'Search keywords', required: true },
    { name: 'limit', type: 'number', description: 'Max results (default 25)' },
  ],
  handler: async (params) =>
    searchSeries({
      search_text: String(params.search_text ?? ''),
      limit: params.limit ? Number(params.limit) : 25,
    }),
})

register({
  name: 'fred_series_observations',
  description: 'Get time-series observations for a FRED series ID.',
  category: 'fred',
  tags: ['fred', 'macro', 'timeseries', 'economic'],
  parameters: [
    { name: 'series_id', type: 'string', description: 'FRED series ID, e.g. UNRATE or GDP', required: true },
    { name: 'observation_start', type: 'string', description: 'Start date YYYY-MM-DD' },
    { name: 'observation_end', type: 'string', description: 'End date YYYY-MM-DD' },
    { name: 'limit', type: 'number', description: 'Max observations (default 100)' },
  ],
  handler: async (params) =>
    seriesObservations({
      series_id: String(params.series_id ?? ''),
      observation_start: params.observation_start
        ? String(params.observation_start)
        : undefined,
      observation_end: params.observation_end ? String(params.observation_end) : undefined,
      limit: params.limit ? Number(params.limit) : 100,
    }),
})

register({
  name: 'fred_series_info',
  description: 'Get metadata for a FRED economic data series.',
  category: 'fred',
  tags: ['fred', 'macro', 'metadata'],
  parameters: [
    { name: 'series_id', type: 'string', description: 'FRED series ID', required: true },
  ],
  handler: async (params) => seriesInfo({ series_id: String(params.series_id ?? '') }),
})

register({
  name: 'census_query',
  description: 'Query U.S. Census Bureau data API for demographic and economic statistics.',
  category: 'census',
  tags: ['census', 'demographics', 'economic', 'population'],
  parameters: [
    { name: 'year', type: 'string', description: 'Data year, e.g. 2022', required: true },
    { name: 'dataset', type: 'string', description: 'Dataset path, e.g. acs/acs5', required: true },
    { name: 'get', type: 'string', description: 'Comma-separated variables', required: true },
    { name: 'for', type: 'string', description: 'Geography filter, e.g. state:*' },
    { name: 'in', type: 'string', description: 'Nested geography, e.g. state:06' },
  ],
  handler: async (params) =>
    censusQuery({
      year: String(params.year ?? ''),
      dataset: String(params.dataset ?? ''),
      get: String(params.get ?? ''),
      for: params.for ? String(params.for) : undefined,
      in: params.in ? String(params.in) : undefined,
    }),
})

register({
  name: 'census_acs5',
  description: 'Query ACS 5-year estimates for a geography.',
  category: 'census',
  tags: ['census', 'acs', 'demographics'],
  parameters: [
    { name: 'year', type: 'string', description: 'ACS year, e.g. 2022', required: true },
    { name: 'variables', type: 'string', description: 'Comma-separated variable codes', required: true },
    { name: 'geography', type: 'string', description: 'Geography, e.g. state:06 or county:*', required: true },
  ],
  handler: async (params) =>
    acs5(String(params.year ?? ''), String(params.variables ?? ''), String(params.geography ?? '')),
})

register({
  name: 'lda_filings',
  description: 'Search federal lobbying disclosure filings (LD-1/LD-2).',
  category: 'lda',
  tags: ['lobbying', 'political', 'government', 'lda'],
  parameters: [
    { name: 'client_name', type: 'string', description: 'Filter by client name' },
    { name: 'registrant_name', type: 'string', description: 'Filter by registrant' },
    { name: 'filing_year', type: 'number', description: 'Filing year' },
    { name: 'page', type: 'number', description: 'Page number (default 1)' },
  ],
  handler: async (params) =>
    listFilings({
      client_name: params.client_name ? String(params.client_name) : undefined,
      registrant_name: params.registrant_name ? String(params.registrant_name) : undefined,
      filing_year: params.filing_year ? Number(params.filing_year) : undefined,
      page: params.page ? Number(params.page) : 1,
    }),
})

register({
  name: 'lda_registrants',
  description: 'Search federal lobbying registrants.',
  category: 'lda',
  tags: ['lobbying', 'registrant', 'government'],
  parameters: [
    { name: 'registrant_name', type: 'string', description: 'Registrant name filter' },
    { name: 'page', type: 'number', description: 'Page number (default 1)' },
  ],
  handler: async (params) =>
    listRegistrants({
      registrant_name: params.registrant_name ? String(params.registrant_name) : undefined,
      page: params.page ? Number(params.page) : 1,
    }),
})

register({
  name: 'usaspending_search_awards',
  description: 'Search federal spending awards by keyword, agency, or time period.',
  category: 'usaspending',
  tags: ['spending', 'government', 'contracts', 'grants'],
  parameters: [
    { name: 'keywords', type: 'array', description: 'Keywords to search, e.g. ["defense","AI"]' },
    { name: 'limit', type: 'number', description: 'Max results (default 25)' },
    { name: 'page', type: 'number', description: 'Page number' },
  ],
  handler: async (params) =>
    searchSpendingByAward({
      keywords: Array.isArray(params.keywords)
        ? params.keywords.map(String)
        : params.keywords
          ? [String(params.keywords)]
          : undefined,
      limit: params.limit ? Number(params.limit) : 25,
      page: params.page ? Number(params.page) : 1,
    }),
})

register({
  name: 'usaspending_spending_by_geography',
  description: 'Get federal spending totals by U.S. state or geography.',
  category: 'usaspending',
  tags: ['spending', 'geography', 'government'],
  parameters: [
    { name: 'geo_layer', type: 'string', description: 'state, county, district, or country' },
    { name: 'scope', type: 'string', description: 'place_of_performance or recipient_location' },
  ],
  handler: async (params) =>
    searchSpendingByGeography({
      geo_layer: params.geo_layer ? (String(params.geo_layer) as 'state') : undefined,
      scope: params.scope ? (String(params.scope) as 'place_of_performance') : undefined,
    }),
})

register({
  name: 'usaspending_autocomplete_recipient',
  description: 'Autocomplete federal award recipients by name.',
  category: 'usaspending',
  tags: ['spending', 'recipient', 'contracts'],
  parameters: [
    { name: 'search_text', type: 'string', description: 'Recipient name prefix', required: true },
  ],
  handler: async (params) =>
    autocompleteRecipient(String(params.search_text ?? '')),
})

register({
  name: 'usaspending_list_agencies',
  description: 'List top-tier federal agencies with spending data.',
  category: 'usaspending',
  tags: ['spending', 'agency', 'government'],
  parameters: [],
  handler: async () => listAgencies(),
})

register({
  name: 'edgar_submissions',
  description: 'Get SEC EDGAR filing history for a company by ticker or CIK.',
  category: 'edgar',
  tags: ['sec', 'edgar', 'filings', '10-k', '10-q'],
  parameters: [
    { name: 'ticker', type: 'string', description: 'Ticker symbol or CIK', required: true },
  ],
  handler: async (params) => submissions(String(params.ticker ?? '')),
})

register({
  name: 'edgar_company_facts',
  description: 'Get all XBRL financial facts for a company from SEC EDGAR.',
  category: 'edgar',
  tags: ['sec', 'edgar', 'xbrl', 'fundamentals'],
  parameters: [
    { name: 'ticker', type: 'string', description: 'Ticker symbol or CIK', required: true },
  ],
  handler: async (params) => companyFacts(String(params.ticker ?? '')),
})

register({
  name: 'edgar_company_concept',
  description: 'Get a single XBRL financial concept over time from SEC EDGAR.',
  category: 'edgar',
  tags: ['sec', 'edgar', 'xbrl', 'revenue', 'earnings'],
  parameters: [
    { name: 'ticker', type: 'string', description: 'Ticker symbol or CIK', required: true },
    { name: 'taxonomy', type: 'string', description: 'e.g. us-gaap', required: true },
    { name: 'concept', type: 'string', description: 'e.g. Revenues or NetIncomeLoss', required: true },
  ],
  handler: async (params) =>
    companyConcept(
      String(params.ticker ?? ''),
      String(params.taxonomy ?? ''),
      String(params.concept ?? '')
    ),
})

register({
  name: 'edgar_search_filings',
  description: 'Full-text search SEC EDGAR filings by keyword and form type.',
  category: 'edgar',
  tags: ['sec', 'edgar', 'search', 'filings'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search keywords', required: true },
    { name: 'forms', type: 'string', description: 'Form types, e.g. 10-K or 8-K' },
    { name: 'startDate', type: 'string', description: 'Start date YYYY-MM-DD' },
    { name: 'endDate', type: 'string', description: 'End date YYYY-MM-DD' },
    { name: 'size', type: 'number', description: 'Max results (default 25)' },
  ],
  handler: async (params) =>
    searchFilings({
      query: String(params.query ?? ''),
      forms: params.forms ? String(params.forms) : undefined,
      startDate: params.startDate ? String(params.startDate) : undefined,
      endDate: params.endDate ? String(params.endDate) : undefined,
      size: params.size ? Number(params.size) : 25,
    }),
})
