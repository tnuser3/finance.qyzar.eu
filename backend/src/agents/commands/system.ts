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
  name: 'list_commands',
  description:
    'Search the command index to discover tools by keyword, category, or tag.',
  category: 'system',
  tags: ['meta', 'index', 'discover'],
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Keywords to search for relevant commands',
    },
    {
      name: 'category',
      type: 'string',
      description:
        'Filter by category, e.g. gdelt, currentsapi, guardian, alphavantage, fmp, finnhub, massive, coingecko, reddit, googletrends, rss, fred, census, lda, gnews, usaspending, edgar, stocktwits, or system',
    },
    {
      name: 'tag',
      type: 'string',
      description: 'Filter by tag, e.g. news or geo',
    },
  ],
  handler: (params) => {
    let commands;

    if (params.category) {
      commands = listByCategory(String(params.category));
    } else if (params.tag) {
      commands = listByTag(String(params.tag));
    } else {
      commands = searchCommands(String(params.query ?? ''), 100);
    }

    return {
      commands,
      availablePlatforms: getAvailablePlatforms(),
      note:
        'Only commands from available platforms are returned. Pass platform in command_call parameters to prefer a provider.',
    };
  },
})
