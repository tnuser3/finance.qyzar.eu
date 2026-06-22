import type { Command, CommandIndexEntry } from './types';
import * as registry from './registry';
import { filterAvailableCommands, isCommandAvailable } from '../../providers/command-availability';

const NEWS_KEYWORDS = new Set([
  'news',
  'article',
  'headline',
  'event',
  'geopolit',
  'conflict',
  'coverage',
  'media',
  'tone',
  'timeline',
  'geo',
  'country',
  'region',
  'gdelt',
  'currents',
  'currentsapi',
  'guardian',
  'headlines',
]);

const MACRO_KEYWORDS = new Set([
  'macro',
  'macroeconomic',
  'rates',
  'interest',
  'fed',
  'federal',
  'inflation',
  'cpi',
  'employment',
  'jobs',
  'gdp',
  'treasury',
  'yield',
  'debt',
  'currency',
  'trade',
  'tariff',
  'central',
  'bank',
  'recession',
  'spending',
]);

const FINANCE_KEYWORDS = new Set([
  'stock',
  'stocks',
  'ticker',
  'symbol',
  'quote',
  'price',
  'market',
  'equity',
  'equities',
  'earnings',
  'company',
  'portfolio',
  'trading',
  'finance',
  'financial',
  'alphavantage',
  'alpha',
  'vantage',
  'fmp',
  'finnhub',
  'massive',
  'polygon',
  'aapl',
  'tsla',
  'nvda',
  'rsi',
  'macd',
  'technical',
]);

const CRYPTO_KEYWORDS = new Set([
  'crypto',
  'cryptocurrency',
  'cryptocurrencies',
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'solana',
  'sol',
  'defi',
  'blockchain',
  'token',
  'altcoin',
  'coingecko',
  'coin',
  'memecoin',
  'stablecoin',
  'web3',
]);

const REGULATORY_KEYWORDS = new Set([
  'sec',
  'ftc',
  'doj',
  'fed',
  'federal',
  'reserve',
  'cftc',
  'treasury',
  'cfpb',
  'fdic',
  'occ',
  'regulatory',
  'regulation',
  'enforcement',
  'litigation',
  'antitrust',
  'sanction',
  'rss',
  'government',
  'agency',
]);

const REDDIT_KEYWORDS = new Set([
  'reddit',
  'subreddit',
  'wsb',
  'wallstreetbets',
  'retail',
  'sentiment',
  'discussion',
  'social',
  'meme',
  'forum',
]);

const TRENDS_KEYWORDS = new Set([
  'trends',
  'googletrends',
  'google',
  'search',
  'interest',
  'popularity',
  'viral',
  'attention',
]);

const ECONOMIC_KEYWORDS = new Set([
  'fred',
  'gdp',
  'cpi',
  'unemployment',
  'macro',
  'economic',
  'census',
  'demographic',
  'population',
  'lobbying',
  'lobbyist',
  'lda',
  'spending',
  'contract',
  'grant',
  'usaspending',
  'edgar',
  'filing',
  '10-k',
  '10k',
  'xbrl',
  'gnews',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function scoreCommand(command: Command, tokens: string[]): number {
  let score = 0;
  const haystack = [
    command.name,
    command.description,
    command.category ?? '',
    ...(command.tags ?? []),
    ...command.parameters.map((param) => `${param.name} ${param.description}`),
  ]
    .join(' ')
    .toLowerCase();

  for (const token of tokens) {
    if (command.name.toLowerCase().includes(token)) {
      score += 8;
    }

    if (haystack.includes(token)) {
      score += 3;
    }
  }

  if (
    (command.category === 'gdelt' ||
      command.category === 'currentsapi' ||
      command.category === 'guardian') &&
    tokens.some((token) => NEWS_KEYWORDS.has(token))
  ) {
    score += 4;
  }

  if (
    (command.category === 'alphavantage' ||
      command.category === 'fmp' ||
      command.category === 'finnhub' ||
      command.category === 'massive') &&
    tokens.some((token) => FINANCE_KEYWORDS.has(token))
  ) {
    score += 4;
  }

  if (
    command.category === 'coingecko' &&
    tokens.some((token) => CRYPTO_KEYWORDS.has(token))
  ) {
    score += 8;
  }

  if (
    tokens.some((token) => MACRO_KEYWORDS.has(token)) &&
    (command.category === 'alphavantage' ||
      command.category === 'fmp' ||
      command.category === 'finnhub' ||
      command.category === 'massive' ||
      command.category === 'gdelt' ||
      command.category === 'guardian' ||
      command.category === 'currentsapi' ||
      command.category === 'rss' ||
      command.category === 'googletrends' ||
      command.category === 'fred' ||
      command.category === 'census')
  ) {
    score += 3;
  }

  if (
    command.category === 'rss' &&
    tokens.some((token) => REGULATORY_KEYWORDS.has(token))
  ) {
    score += 5;
  }

  if (
    command.category === 'reddit' &&
    tokens.some((token) => REDDIT_KEYWORDS.has(token))
  ) {
    score += 5;
  }

  if (
    command.category === 'googletrends' &&
    tokens.some((token) => TRENDS_KEYWORDS.has(token))
  ) {
    score += 5;
  }

  if (
    tokens.some((token) => ECONOMIC_KEYWORDS.has(token)) &&
    (command.category === 'fred' ||
      command.category === 'census' ||
      command.category === 'lda' ||
      command.category === 'gnews' ||
      command.category === 'usaspending' ||
      command.category === 'edgar')
  ) {
    score += 5;
  }

  if (
    command.category === 'edgar' &&
    tokens.some((token) => FINANCE_KEYWORDS.has(token) || REGULATORY_KEYWORDS.has(token))
  ) {
    score += 4;
  }

  return score;
}

function toIndexEntry(command: Command, score?: number): CommandIndexEntry {
  return {
    name: command.name,
    description: command.description,
    category: command.category,
    tags: command.tags ?? [],
    parameters: command.parameters,
    score,
  };
}

export function searchCommands(query: string, limit = 8): CommandIndexEntry[] {
  const tokens = tokenize(query);

  return filterAvailableCommands(registry.list())
    .map((command) => ({
      command,
      score: scoreCommand(command, tokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => toIndexEntry(entry.command, entry.score));
}

export function listByCategory(category: string): CommandIndexEntry[] {
  return registry
    .list()
    .filter((command) => command.category === category && isCommandAvailable(command))
    .map((command) => toIndexEntry(command));
}

export function listByTag(tag: string): CommandIndexEntry[] {
  return registry
    .list()
    .filter((command) => command.tags?.includes(tag) && isCommandAvailable(command))
    .map((command) => toIndexEntry(command));
}

function rankCommandsForPrompt(
  commands: Command[],
  prompt: string
): CommandIndexEntry[] {
  const tokens = tokenize(prompt);
  const ranked = commands
    .map((command) => ({
      command,
      score: scoreCommand(command, tokens),
    }))
    .sort((left, right) => right.score - left.score);

  const selected = new Map<string, CommandIndexEntry>();

  for (const entry of ranked) {
    selected.set(entry.command.name, toIndexEntry(entry.command, entry.score));
  }

  const listCommands = registry.get('list_commands');

  if (listCommands && isCommandAvailable(listCommands)) {
    selected.set(listCommands.name, toIndexEntry(listCommands));
  }

  return Array.from(selected.values());
}

export function resolveIndexedCommands(
  prompt: string,
  explicit?: Command[]
): { commands: Command[]; index: CommandIndexEntry[] } {
  const commands = explicit?.length
    ? filterAvailableCommands(explicit)
    : filterAvailableCommands(registry.list());

  const listCommands = registry.get('list_commands');

  if (listCommands && isCommandAvailable(listCommands)) {
    if (!commands.some((command) => command.name === listCommands.name)) {
      commands.push(listCommands);
    }
  }

  return {
    commands,
    index: rankCommandsForPrompt(commands, prompt),
  };
}
