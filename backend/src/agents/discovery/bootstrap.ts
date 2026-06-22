import * as registry from '../runtime/registry';
import type { CommandCall, CommandResult } from '../runtime/types';
import { filterEnglishNewsRows } from './helpers';
import { isCommandNameAvailable } from '../../providers/command-availability';
import { getRateLimitStatus, providerFromCommand } from '../../infra/http/ratelimit';

export interface DiscoveryBootstrapResult {
  evidenceSummary: string;
  seedToolCalls: number;
  results: CommandResult[];
}

interface SeedSpec {
  name: string;
  parameters: Record<string, unknown>;
}

const SEED_TIMEOUT_MS = Number(process.env.DISCOVERY_SEED_TIMEOUT_MS) || 90_000;
const GDELT_SEED_TIMEOUT_MS = Number(process.env.GDELT_SEED_TIMEOUT_MS) || 120_000;

const GDELT_ENGLISH = ' sourcelang:english';

const SEED_COMMANDS: Record<string, SeedSpec[]> = {
  commodities: [
    {
      name: 'gdelt_search_articles',
      parameters: {
        query: `(oil OR copper OR commodity) supply chain${GDELT_ENGLISH}`,
        maxrecords: 15,
        timespan: '7d',
      },
    },
    {
      name: 'fred_search_series',
      parameters: { search_text: 'crude oil', limit: 5 },
    },
  ],
  future_opportunist: [
    {
      name: 'gdelt_search_articles',
      parameters: {
        query: `(IPO OR SPAC OR listing) stock market${GDELT_ENGLISH}`,
        maxrecords: 15,
        timespan: '7d',
      },
    },
    {
      name: 'currentsapi_search',
      parameters: { keywords: 'IPO OR SPAC OR Nasdaq listing', language: 'en' },
    },
  ],
  conservationist: [
    {
      name: 'guardian_search',
      parameters: { q: 'utility OR telecom OR dividend', 'page-size': 10 },
    },
    {
      name: 'rss_fetch_tier',
      parameters: { tier: 1, limitPerFeed: 5 },
    },
  ],
  crypto_analysis: [
    {
      name: 'coingecko_markets',
      parameters: { per_page: 15, order: 'market_cap_desc' },
    },
    {
      name: 'gdelt_search_articles',
      parameters: {
        query: `(bitcoin OR ethereum OR crypto) market${GDELT_ENGLISH}`,
        maxrecords: 15,
        timespan: '7d',
      },
    },
  ],
  macroeconomic: [
    {
      name: 'fred_search_series',
      parameters: { search_text: 'inflation CPI', limit: 5 },
    },
    {
      name: 'gdelt_search_articles',
      parameters: {
        query: `("Federal Reserve" OR inflation OR "jobs report")${GDELT_ENGLISH}`,
        maxrecords: 15,
        timespan: '7d',
      },
    },
  ],
  regulatory_discovery: [
    {
      name: 'rss_fetch_tier',
      parameters: { tier: 1, limitPerFeed: 5 },
    },
    {
      name: 'edgar_search_filings',
      parameters: { query: 'investigation OR enforcement', size: 10 },
    },
  ],
  industry_surge: [
    {
      name: 'googletrends_related_queries',
      parameters: { keyword: 'artificial intelligence', geo: 'US' },
    },
    {
      name: 'gdelt_timeline_volume',
      parameters: {
        query: `(renewable energy OR biotech OR semiconductor)${GDELT_ENGLISH}`,
        timespan: '30d',
      },
    },
    {
      name: 'reddit_search',
      parameters: { q: 'industry growth OR sector surge', sort: 'top', time: 'week', limit: 10 },
    },
  ],
};

const DEFAULT_SEEDS: SeedSpec[] = [
  {
    name: 'rss_fetch_tier',
    parameters: { tier: 1, limitPerFeed: 5 },
  },
];

function seedKey(seed: SeedSpec): string {
  return `${seed.name}:${JSON.stringify(seed.parameters)}`;
}

function summarizeSeedResult(name: string, result: CommandResult): string {
  const filtered = filterEnglishNewsRows(result.result);
  const serialized = JSON.stringify(filtered, null, 2);
  const preview = serialized.length > 1200 ? `${serialized.slice(0, 1200)}...` : serialized;
  return `[seed:${name}]\n${preview}`;
}

function availableSeedsForAgent(agentId: string): SeedSpec[] {
  const seeds = SEED_COMMANDS[agentId] ?? DEFAULT_SEEDS;
  return seeds.filter((seed) => isCommandNameAvailable(seed.name) && registry.get(seed.name));
}

function buildAgentResult(
  agentId: string,
  seeds: SeedSpec[],
  resultByKey: Map<string, CommandResult>
): DiscoveryBootstrapResult {
  const results: CommandResult[] = [];
  const summaries: string[] = [];

  for (const seed of seeds) {
    const result = resultByKey.get(seedKey(seed));

    if (!result) {
      continue;
    }

    if (!result.ok) {
      continue;
    }

    const filteredResult =
      result.result !== undefined
        ? { ...result, result: filterEnglishNewsRows(result.result) }
        : result;

    results.push(filteredResult);
    summaries.push(summarizeSeedResult(seed.name, filteredResult));
  }

  const successful = results.length;

  return {
    evidenceSummary: summaries.join('\n'),
    seedToolCalls: successful,
    results,
  };
}

async function executeSeedWithTimeout(
  seed: SeedSpec,
  timeoutMs = SEED_TIMEOUT_MS
): Promise<CommandResult> {
  if (!registry.get(seed.name) || !isCommandNameAvailable(seed.name)) {
    return {
      name: seed.name,
      ok: false,
      error: `seed unavailable: ${seed.name}`,
    };
  }

  const provider = providerFromCommand(seed.name);
  const effectiveTimeout =
    provider === 'gdelt'
      ? Math.max(timeoutMs, GDELT_SEED_TIMEOUT_MS)
      : timeoutMs;

  const call: CommandCall = { name: seed.name, parameters: seed.parameters };

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      registry.execute(call),
      new Promise<CommandResult>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              name: seed.name,
              ok: false,
              error: `seed timed out after ${effectiveTimeout}ms`,
            }),
          effectiveTimeout
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function runProviderSeeds(
  seeds: Array<[string, SeedSpec]>,
  resultByKey: Map<string, CommandResult>,
  onEvent?: (event: Record<string, unknown>) => void
): Promise<void> {
  for (const [key, seed] of seeds) {
    if (!isCommandNameAvailable(seed.name)) {
      continue;
    }

    const provider = providerFromCommand(seed.name);
    const queue = getRateLimitStatus(provider);

    onEvent?.({
      type: 'bootstrap_seed_start',
      name: seed.name,
      provider,
      queueDepth: queue.queueDepth,
      estimatedWaitMs: queue.estimatedWaitMs,
      blockedUntil: queue.blockedUntil,
    });

    const started = Date.now();
    const result = await executeSeedWithTimeout(seed);
    const durationMs = Date.now() - started;

    resultByKey.set(key, result);

    onEvent?.({
      type: 'bootstrap_seed_end',
      name: seed.name,
      provider,
      durationMs,
      ok: result.ok,
      error: result.error,
      rateLimited: result.rateLimited === true,
    });
  }
}

export async function bootstrapAllDiscoveryAgents(
  agentIds: string[],
  onEvent?: (event: Record<string, unknown>) => void
): Promise<Map<string, DiscoveryBootstrapResult>> {
  const seedsByAgent = new Map<string, SeedSpec[]>();
  const uniqueSeeds = new Map<string, SeedSpec>();

  for (const agentId of agentIds) {
    const seeds = availableSeedsForAgent(agentId);
    seedsByAgent.set(agentId, seeds);

    for (const seed of seeds) {
      uniqueSeeds.set(seedKey(seed), seed);
    }
  }

  onEvent?.({
    type: 'bootstrap_batch_start',
    agentCount: agentIds.length,
    uniqueSeeds: uniqueSeeds.size,
  });

  const batchStarted = Date.now();
  const resultByKey = new Map<string, CommandResult>();
  const seedsByProvider = new Map<string, Array<[string, SeedSpec]>>();

  for (const [key, seed] of uniqueSeeds.entries()) {
    const provider = providerFromCommand(seed.name);
    const group = seedsByProvider.get(provider) ?? [];
    group.push([key, seed]);
    seedsByProvider.set(provider, group);
  }

  await Promise.all(
    [...seedsByProvider.entries()].map(([provider, seeds]) =>
      runProviderSeeds(seeds, resultByKey, (event) =>
        onEvent?.({ ...event, provider })
      )
    )
  );

  onEvent?.({
    type: 'bootstrap_batch_end',
    durationMs: Date.now() - batchStarted,
    uniqueSeeds: uniqueSeeds.size,
  });

  const results = new Map<string, DiscoveryBootstrapResult>();

  for (const agentId of agentIds) {
    const agentResult = buildAgentResult(agentId, seedsByAgent.get(agentId) ?? [], resultByKey);

    onEvent?.({
      type: 'bootstrap_end',
      agentId,
      durationMs: Date.now() - batchStarted,
      seedTools: agentResult.seedToolCalls,
    });

    results.set(agentId, agentResult);
  }

  return results;
}


export async function bootstrapDiscoveryAgent(
  agentId: string,
  onEvent?: (event: Record<string, unknown>) => void
): Promise<DiscoveryBootstrapResult> {
  const map = await bootstrapAllDiscoveryAgents([agentId], (event) =>
    onEvent?.({ ...event, agentId: event.agentId ?? agentId })
  );

  return map.get(agentId) ?? {
    evidenceSummary: '',
    seedToolCalls: 0,
    results: [],
  };
}
