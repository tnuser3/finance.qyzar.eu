import {
  API_PROVIDERS,
  getProviderStatus,
  type ApiProviderStatus,
  type ApiProviderStatusSnapshot,
} from './api-status';
import type { Command } from '../agents/runtime/types';

const PLATFORM_ALIASES: Record<string, string> = {
  alphavantage: 'alphavantage',
  alpha: 'alphavantage',
  av: 'alphavantage',
  vantage: 'alphavantage',
  fmp: 'fmp',
  finnhub: 'finnhub',
  massive: 'massive',
  polygon: 'massive',
  yahoo: 'yahoo',
  gdelt: 'gdelt',
  guardian: 'guardian',
  currents: 'currentsapi',
  currentsapi: 'currentsapi',
  gnews: 'gnews',
  rss: 'rss',
  fred: 'fred',
  census: 'census',
  lda: 'lda',
  usaspending: 'usaspending',
  edgar: 'edgar',
  reddit: 'reddit',
  stocktwits: 'stocktwits',
  googletrends: 'googletrends',
  trends: 'googletrends',
  serpapi: 'serpapi',
  deepai: 'deepai',
  coingecko: 'coingecko',
  cg: 'coingecko',
  coin: 'coingecko',
};

export interface AvailablePlatform {
  id: string;
  name: string;
  category: string;
  status: ApiProviderStatus;
  lastResponseTimeMs: number | null;
  avgResponseTimeMs: number | null;
}

export function normalizePlatform(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return PLATFORM_ALIASES[normalized] ?? normalized;
}

export function providerFromCommandName(commandName: string): string | null {
  if (commandName === 'list_commands') {
    return 'system';
  }

  const prefix = commandName.split('_')[0];
  return prefix || null;
}

export function isProviderAvailable(providerId: string): boolean {
  if (providerId === 'system') {
    return true;
  }

  const status = getProviderStatus(providerId);

  if (!status) {
    return false;
  }

  if (!status.configured) {
    return false;
  }

  if (status.rateLimit.rateLimited) {
    return false;
  }

  if (status.rateLimit.dailyQuota?.exceeded) {
    return false;
  }

  if (status.status === 'degraded' || status.status === 'unconfigured' || status.status === 'error') {
    return false;
  }

  return true;
}

export function isCommandAvailable(command: Command): boolean {
  if (!command.category || command.category === 'system') {
    return true;
  }

  return isProviderAvailable(command.category);
}

export function isCommandNameAvailable(commandName: string): boolean {
  const provider = providerFromCommandName(commandName);

  if (!provider || provider === 'system') {
    return commandName === 'list_commands';
  }

  return isProviderAvailable(provider);
}

export function commandMatchesPlatform(commandName: string, platform: string): boolean {
  const provider = providerFromCommandName(commandName);
  return provider === platform;
}

export function filterAvailableCommands(commands: Command[]): Command[] {
  return commands.filter(isCommandAvailable);
}

export function getAvailablePlatforms(): AvailablePlatform[] {
  return API_PROVIDERS.filter((provider) => isProviderAvailable(provider.id)).map(
    (provider) => {
      const status = getProviderStatus(provider.id)!;

      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        status: status.status,
        lastResponseTimeMs: status.lastResponseTimeMs,
        avgResponseTimeMs: status.avgResponseTimeMs,
      };
    }
  );
}

export function getUnavailableProviders(): ApiProviderStatusSnapshot[] {
  return API_PROVIDERS.map((provider) => getProviderStatus(provider.id)!)
    .filter((provider) => !isProviderAvailable(provider.id))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      category: provider.category,
      description: provider.description,
      requiresApiKey: provider.requiresApiKey,
      configured: provider.configured,
      status: provider.status,
      rateLimit: provider.rateLimit,
      lastOutcome: provider.lastOutcome,
      lastSuccessAt: provider.lastSuccessAt,
      lastErrorAt: provider.lastErrorAt,
      lastError: provider.lastError,
      requestCount: provider.requestCount,
      successCount: provider.successCount,
      errorCount: provider.errorCount,
      rateLimitCount: provider.rateLimitCount,
      lastResponseTimeMs: provider.lastResponseTimeMs,
      avgResponseTimeMs: provider.avgResponseTimeMs,
    }));
}

export function buildPlatformGuidance(): string {
  const available = getAvailablePlatforms();

  if (available.length === 0) {
    return 'No external data platforms are currently available. Use list_commands sparingly and explain data gaps.';
  }

  const platformList = available.map((platform) => platform.id).join(', ');

  return (
    `Available platforms right now: ${platformList}. ` +
    'Pass an optional "platform" parameter in command_call to choose a provider, e.g. {"name":"fmp_quote","parameters":{"symbol":"AAPL","platform":"finnhub"}}. ' +
    'Only available platforms appear in your tool catalog. If your chosen platform fails, the system automatically tries the next best available alternative and reports fallback metadata.'
  );
}

export function stripPlatformParam(
  params: Record<string, unknown>
): { params: Record<string, unknown>; platform: string | null } {
  if (!('platform' in params)) {
    return { params, platform: null };
  }

  const platform = normalizePlatform(params.platform);
  const rest = { ...params };
  delete rest.platform;

  return { params: rest, platform };
}
