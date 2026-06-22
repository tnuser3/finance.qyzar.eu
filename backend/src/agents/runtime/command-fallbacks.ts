import { RateLimitError, RateLimitUnavailableError } from '../../infra/http/ratelimit';
import type { CommandCall, CommandResult } from './types';
import {
  commandMatchesPlatform,
  isCommandNameAvailable,
  stripPlatformParam,
} from '../../providers/command-availability';

export type CommandRunner = (
  commandName: string,
  params: Record<string, unknown>
) => Promise<CommandResult>;

const QUOTE_COMMANDS = [
  'fmp_quote',
  'finnhub_quote',
  'alphavantage_global_quote',
  'massive_snapshot',
];

const SYMBOL_SEARCH_COMMANDS = [
  'fmp_search_symbol',
  'fmp_search_name',
  'finnhub_symbol_search',
  'alphavantage_symbol_search',
  'massive_ticker_search',
];

const PROFILE_COMMANDS = [
  'fmp_profile',
  'finnhub_company_profile',
  'alphavantage_company_overview',
  'massive_ticker_details',
];

const HISTORY_COMMANDS = [
  'fmp_historical_prices',
  'finnhub_candles',
  'alphavantage_daily_series',
  'massive_aggregates',
];

const STOCK_NEWS_COMMANDS = [
  'fmp_stock_news',
  'finnhub_company_news',
  'massive_news',
  'alphavantage_news_sentiment',
  'gnews_search',
];

const MARKET_NEWS_COMMANDS = [
  'finnhub_market_news',
  'gnews_top_headlines',
  'currentsapi_latest_news',
  'gdelt_search_articles',
];

const NEWS_SEARCH_COMMANDS = [
  'gnews_search',
  'gdelt_search_articles',
  'currentsapi_search',
  'guardian_search',
];

const EARNINGS_COMMANDS = [
  'fmp_earnings',
  'finnhub_earnings',
  'alphavantage_earnings',
];

const INCOME_COMMANDS = [
  'fmp_income_statement',
  'alphavantage_income_statement',
  'massive_financials',
];

const BALANCE_COMMANDS = [
  'fmp_balance_sheet',
  'alphavantage_balance_sheet',
  'massive_financials',
];

const CASHFLOW_COMMANDS = ['fmp_cash_flow', 'massive_financials'];

const METRICS_COMMANDS = [
  'fmp_key_metrics',
  'finnhub_basic_financials',
  'alphavantage_company_overview',
];

const RSI_COMMANDS = ['fmp_rsi', 'alphavantage_rsi'];

const SMA_COMMANDS = ['fmp_sma'];

const TECHNICAL_COMMANDS = ['alphavantage_macd', 'alphavantage_bbands', 'alphavantage_rsi'];

const CRYPTO_PRICE_COMMANDS = ['coingecko_price'];

const CRYPTO_SEARCH_COMMANDS = ['coingecko_search'];

const CRYPTO_HISTORY_COMMANDS = ['coingecko_market_chart'];

const CRYPTO_MARKET_COMMANDS = ['coingecko_markets', 'coingecko_trending'];

function buildGroupMap(groups: string[][]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const group of groups) {
    for (const command of group) {
      map[command] = group.filter((candidate) => candidate !== command);
    }
  }

  return map;
}

const FALLBACK_CHAINS: Record<string, string[]> = buildGroupMap([
  QUOTE_COMMANDS,
  SYMBOL_SEARCH_COMMANDS,
  PROFILE_COMMANDS,
  HISTORY_COMMANDS,
  STOCK_NEWS_COMMANDS,
  MARKET_NEWS_COMMANDS,
  NEWS_SEARCH_COMMANDS,
  EARNINGS_COMMANDS,
  INCOME_COMMANDS,
  BALANCE_COMMANDS,
  CASHFLOW_COMMANDS,
  METRICS_COMMANDS,
  RSI_COMMANDS,
  SMA_COMMANDS,
  TECHNICAL_COMMANDS,
  CRYPTO_PRICE_COMMANDS,
  CRYPTO_SEARCH_COMMANDS,
  CRYPTO_HISTORY_COMMANDS,
  CRYPTO_MARKET_COMMANDS,
]);

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function getFallbackChain(commandName: string): string[] {
  return FALLBACK_CHAINS[commandName] ?? [];
}

function getAvailableFallbackChain(commandName: string): string[] {
  return getFallbackChain(commandName).filter((command) => isCommandNameAvailable(command));
}

function buildExecutionOrder(
  requestedCommand: string,
  platform: string | null,
  hasCommand: (commandName: string) => boolean
): string[] {
  const candidates = [
    requestedCommand,
    ...getAvailableFallbackChain(requestedCommand),
  ].filter((command, index, list) => list.indexOf(command) === index);

  const available = candidates.filter(
    (command) => hasCommand(command) && isCommandNameAvailable(command)
  );

  if (!platform) {
    return available;
  }

  const preferred = available.filter((command) => commandMatchesPlatform(command, platform));
  const remainder = available.filter((command) => !commandMatchesPlatform(command, platform));

  return [...preferred, ...remainder];
}

export function mapParameters(
  targetCommand: string,
  sourceParams: Record<string, unknown>
): Record<string, unknown> {
  const symbol = asString(sourceParams.symbol ?? sourceParams.ticker);
  const query = asString(
    sourceParams.query ?? sourceParams.keywords ?? sourceParams.q ?? symbol
  );
  const limit = asNumber(sourceParams.limit ?? sourceParams.max ?? sourceParams.maxrecords);

  switch (targetCommand) {
    case 'alphavantage_symbol_search':
      return { keywords: query ?? '' };
    case 'finnhub_symbol_search':
      return {
        query: query ?? '',
        ...(asString(sourceParams.exchange) ? { exchange: sourceParams.exchange } : {}),
      };
    case 'fmp_search_symbol':
    case 'fmp_search_name':
    case 'massive_ticker_search':
      return {
        query: query ?? '',
        ...(limit !== undefined ? { limit } : {}),
      };
    case 'alphavantage_news_sentiment':
      return {
        ...(symbol ? { tickers: symbol } : {}),
        ...(asString(sourceParams.topics) ? { topics: sourceParams.topics } : {}),
        ...(limit !== undefined ? { limit } : { limit: 20 }),
      };
    case 'gnews_search':
      return {
        query: query ?? symbol ?? '',
        ...(asString(sourceParams.lang) ? { lang: sourceParams.lang } : {}),
        ...(asString(sourceParams.country) ? { country: sourceParams.country } : {}),
        max: limit ?? 10,
      };
    case 'gnews_top_headlines':
      return {
        ...(asString(sourceParams.category) ? { category: sourceParams.category } : {}),
        ...(asString(sourceParams.lang) ? { lang: sourceParams.lang } : {}),
        ...(asString(sourceParams.country) ? { country: sourceParams.country } : {}),
        max: limit ?? 10,
      };
    case 'gdelt_search_articles':
      return {
        query: query ?? symbol ?? '',
        maxrecords: limit ?? 25,
        ...(asString(sourceParams.timespan) ? { timespan: sourceParams.timespan } : { timespan: '7d' }),
      };
    case 'currentsapi_search':
      return {
        keywords: query ?? symbol ?? '',
        ...(asString(sourceParams.language) ? { language: sourceParams.language } : {}),
        ...(asString(sourceParams.country) ? { country: sourceParams.country } : {}),
      };
    case 'currentsapi_latest_news':
      return {
        ...(asString(sourceParams.language) ? { language: sourceParams.language } : {}),
        ...(asString(sourceParams.country) ? { country: sourceParams.country } : {}),
        ...(asString(sourceParams.category) ? { category: sourceParams.category } : {}),
      };
    case 'guardian_search':
      return {
        query: query ?? symbol ?? '',
        ...(asString(sourceParams.section) ? { section: sourceParams.section } : {}),
        ...(asString(sourceParams.tag) ? { tag: sourceParams.tag } : {}),
        ...(asNumber(sourceParams.page) !== undefined ? { page: sourceParams.page } : {}),
      };
    case 'finnhub_company_news':
      return {
        symbol: symbol ?? '',
        ...(asString(sourceParams.from) ? { from: sourceParams.from } : {}),
        ...(asString(sourceParams.to) ? { to: sourceParams.to } : {}),
        ...(asString(sourceParams.outputsize) ? { outputsize: sourceParams.outputsize } : {}),
      };
    case 'finnhub_candles':
      return {
        symbol: symbol ?? '',
        resolution: asString(sourceParams.resolution) ?? 'D',
        ...(sourceParams.from !== undefined ? { from: sourceParams.from } : {}),
        ...(sourceParams.to !== undefined ? { to: sourceParams.to } : {}),
        outputsize: asString(sourceParams.outputsize) ?? 'compact',
      };
    case 'massive_aggregates':
      return {
        symbol: symbol ?? '',
        multiplier: asNumber(sourceParams.multiplier) ?? 1,
        timespan: asString(sourceParams.timespan) ?? 'day',
        ...(asString(sourceParams.from) ? { from: sourceParams.from } : {}),
        ...(asString(sourceParams.to) ? { to: sourceParams.to } : {}),
        ...(asString(sourceParams.outputsize) ? { outputsize: sourceParams.outputsize } : {}),
      };
    case 'alphavantage_daily_series':
      return {
        symbol: symbol ?? '',
        outputsize: asString(sourceParams.outputsize) ?? 'compact',
      };
    case 'fmp_historical_prices':
      return {
        symbol: symbol ?? '',
        ...(asString(sourceParams.from) ? { from: sourceParams.from } : {}),
        ...(asString(sourceParams.to) ? { to: sourceParams.to } : {}),
        outputsize: asString(sourceParams.outputsize) ?? 'compact',
      };
    case 'coingecko_price':
      return {
        ...(symbol ? { symbol } : {}),
        ...(asString(sourceParams.id) ? { id: sourceParams.id } : {}),
        ...(Array.isArray(sourceParams.ids) ? { ids: sourceParams.ids } : {}),
        ...(asString(sourceParams.vs_currency) ? { vs_currency: sourceParams.vs_currency } : {}),
      };
    case 'coingecko_search':
      return { query: query ?? symbol ?? '' };
    case 'coingecko_coin':
    case 'coingecko_market_chart':
      return {
        ...(symbol ? { symbol } : {}),
        ...(asString(sourceParams.id) ? { id: sourceParams.id } : {}),
        ...(sourceParams.days !== undefined ? { days: sourceParams.days } : {}),
        ...(asString(sourceParams.vs_currency) ? { vs_currency: sourceParams.vs_currency } : {}),
        ...(asString(sourceParams.interval) ? { interval: sourceParams.interval } : {}),
      };
    case 'coingecko_markets':
      return {
        ...(asString(sourceParams.vs_currency) ? { vs_currency: sourceParams.vs_currency } : {}),
        ...(asNumber(sourceParams.per_page) !== undefined ? { per_page: sourceParams.per_page } : {}),
        ...(asNumber(sourceParams.page) !== undefined ? { page: sourceParams.page } : {}),
        ...(asString(sourceParams.order) ? { order: sourceParams.order } : {}),
      };
    case 'fmp_income_statement':
    case 'fmp_balance_sheet':
    case 'fmp_cash_flow':
      return {
        symbol: symbol ?? '',
        period: asString(sourceParams.period) ?? 'quarter',
      };
    case 'alphavantage_income_statement':
    case 'alphavantage_balance_sheet':
      return { symbol: symbol ?? '' };
    case 'fmp_rsi':
    case 'fmp_sma':
    case 'alphavantage_rsi':
    case 'alphavantage_macd':
    case 'alphavantage_bbands':
      return {
        symbol: symbol ?? '',
        ...(asNumber(sourceParams.periodLength) !== undefined
          ? { periodLength: sourceParams.periodLength }
          : {}),
        ...(asString(sourceParams.timeframe) ? { timeframe: sourceParams.timeframe } : {}),
        ...(asNumber(sourceParams.fastperiod) !== undefined
          ? { fastperiod: sourceParams.fastperiod }
          : {}),
        ...(asNumber(sourceParams.slowperiod) !== undefined
          ? { slowperiod: sourceParams.slowperiod }
          : {}),
        ...(asNumber(sourceParams.signalperiod) !== undefined
          ? { signalperiod: sourceParams.signalperiod }
          : {}),
        ...(asNumber(sourceParams.time_period) !== undefined
          ? { time_period: sourceParams.time_period }
          : {}),
        ...(asNumber(sourceParams.nbdevup) !== undefined ? { nbdevup: sourceParams.nbdevup } : {}),
        ...(asNumber(sourceParams.nbdevdn) !== undefined ? { nbdevdn: sourceParams.nbdevdn } : {}),
      };
    default:
      if (symbol) {
        return { ...sourceParams, symbol };
      }

      if (query) {
        return { ...sourceParams, query };
      }

      return { ...sourceParams };
  }
}

export function isRetryableFailure(error: unknown): boolean {
  if (error instanceof RateLimitUnavailableError || error instanceof RateLimitError) {
    return true;
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  const patterns = [
    'rate limit',
    'too many requests',
    'temporarily unavailable',
    'call frequency',
    'quota exceeded',
    'thank you for using alpha vantage',
    'api key has been throttled',
    'slow down',
    'requests per',
  ];

  if (patterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  if (/\((402|429|503|502|504)\)/.test(message)) {
    return true;
  }

  if (message.includes('payment required') || message.includes('daily limit')) {
    return true;
  }

  return false;
}

async function runCommand(
  run: CommandRunner,
  commandName: string,
  params: Record<string, unknown>
): Promise<CommandResult> {
  return run(commandName, params);
}

export async function executeWithFallbacks(
  call: CommandCall,
  run: CommandRunner,
  hasCommand: (commandName: string) => boolean
): Promise<CommandResult> {
  const requestedCommand = call.name;
  const { params, platform } = stripPlatformParam(call.parameters ?? {});
  const executionOrder = buildExecutionOrder(requestedCommand, platform, hasCommand);
  const attemptedCommands: string[] = [];
  const failureNotes: string[] = [];

  if (executionOrder.length === 0) {
    return {
      name: requestedCommand,
      ok: false,
      error: platform
        ? `No available commands for platform "${platform}" and ${requestedCommand} is unavailable.`
        : `${requestedCommand} is unavailable (provider not configured, rate-limited, or failing).`,
      requestedCommand,
      attemptedCommands: [],
      preferredPlatform: platform ?? undefined,
    };
  }

  let firstFailure: CommandResult | null = null;

  for (let index = 0; index < executionOrder.length; index++) {
    const commandName = executionOrder[index]!;
    const mappedParams =
      commandName === requestedCommand ? params : mapParameters(commandName, params);
    const attempt = await runCommand(run, commandName, mappedParams);

    if (attempt.ok) {
      if (index === 0 && commandName === requestedCommand) {
        return { ...attempt, name: requestedCommand, requestedCommand };
      }

      const reason =
        platform && commandMatchesPlatform(commandName, platform)
          ? `Used platform "${platform}" via ${commandName}.`
          : platform
            ? `Platform "${platform}" unavailable; fell back to ${commandName}.`
            : `${requestedCommand} failed (${firstFailure?.error ?? 'unavailable'}). Automatically fell back to ${commandName}.`;

      return {
        name: requestedCommand,
        ok: true,
        result: attempt.result,
        fallback: true,
        requestedCommand,
        executedCommand: commandName,
        preferredPlatform: platform ?? undefined,
        attemptedCommands: executionOrder.slice(0, index),
        fallbackReason: reason,
        fallbackNote: failureNotes.length > 0 ? failureNotes.join('; ') : undefined,
      };
    }

    attemptedCommands.push(commandName);
    failureNotes.push(`${commandName}: ${attempt.error ?? 'failed'}`);

    if (!firstFailure) {
      firstFailure = attempt;
    }
  }

  return {
    name: requestedCommand,
    ok: false,
    error:
      failureNotes.length > 0
        ? `All fallback commands failed. ${failureNotes.join('; ')}`
        : firstFailure?.error ?? 'command failed',
    rateLimited: firstFailure?.rateLimited,
    provider: firstFailure?.provider,
    availableAt: firstFailure?.availableAt,
    attemptedCommands,
    fallback: attemptedCommands.length > 0,
    requestedCommand,
    preferredPlatform: platform ?? undefined,
    fallbackReason:
      attemptedCommands.length > 0
        ? `Tried ${attemptedCommands.join(' -> ')} with no successful fallback.`
        : undefined,
  };
}
