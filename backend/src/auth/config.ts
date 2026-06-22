import { query } from '../infra/db/pool';

export type TimeHorizon = '1M' | '3M' | '6M' | '1Y' | '5Y';

export interface UserConfig {
  accountId: string;
  riskPercentage: number;
  conservationPercentage: number;
  preferredSectors: string[];
  excludedSectors: string[];
  maxVolatility: number;
  cryptoExposureLimit: number;
  commodityExposureLimit: number;
  internationalExposureLimit: number;
  timeHorizon: TimeHorizon;
  minConfidenceScore: number;
  allowIPORecommendations: boolean;
  allowEmergingMarkets: boolean;
  updatedAt: string;
}

const DEFAULTS = {
  conservationPercentage: 60,
  riskPercentage: 40,
  preferredSectors: [] as string[],
  excludedSectors: [] as string[],
  maxVolatility: 50,
  cryptoExposureLimit: 100,
  commodityExposureLimit: 100,
  internationalExposureLimit: 100,
  timeHorizon: '1Y' as TimeHorizon,
  minConfidenceScore: 60,
  allowIPORecommendations: true,
  allowEmergingMarkets: true,
};

let initialized = false;

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampHorizon(value: string): TimeHorizon {
  const valid: TimeHorizon[] = ['1M', '3M', '6M', '1Y', '5Y'];
  return valid.includes(value as TimeHorizon) ? (value as TimeHorizon) : '1Y';
}

async function ensureColumns(): Promise<void> {
  await query(`
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS preferred_sectors TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS excluded_sectors TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS max_volatility INTEGER NOT NULL DEFAULT ${DEFAULTS.maxVolatility};
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS crypto_exposure_limit INTEGER NOT NULL DEFAULT ${DEFAULTS.cryptoExposureLimit};
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS commodity_exposure_limit INTEGER NOT NULL DEFAULT ${DEFAULTS.commodityExposureLimit};
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS international_exposure_limit INTEGER NOT NULL DEFAULT ${DEFAULTS.internationalExposureLimit};
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS time_horizon TEXT NOT NULL DEFAULT '${DEFAULTS.timeHorizon}';
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS min_confidence_score INTEGER NOT NULL DEFAULT ${DEFAULTS.minConfidenceScore};
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS allow_ipo_recommendations BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE user_config ADD COLUMN IF NOT EXISTS allow_emerging_markets BOOLEAN NOT NULL DEFAULT true;
  `);
}

export async function init(): Promise<void> {
  if (initialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS user_config (
      account_id UUID PRIMARY KEY,
      conservation_percentage INTEGER NOT NULL DEFAULT ${DEFAULTS.conservationPercentage},
      risk_percentage INTEGER NOT NULL DEFAULT ${DEFAULTS.riskPercentage},
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await ensureColumns();
  initialized = true;
}

function rowToConfig(row: {
  account_id: string;
  conservation_percentage: number;
  risk_percentage: number;
  preferred_sectors?: string[];
  excluded_sectors?: string[];
  max_volatility?: number;
  crypto_exposure_limit?: number;
  commodity_exposure_limit?: number;
  international_exposure_limit?: number;
  time_horizon?: string;
  min_confidence_score?: number;
  allow_ipo_recommendations?: boolean;
  allow_emerging_markets?: boolean;
  updated_at: Date;
}): UserConfig {
  return {
    accountId: row.account_id,
    conservationPercentage: row.conservation_percentage,
    riskPercentage: row.risk_percentage,
    preferredSectors: row.preferred_sectors ?? DEFAULTS.preferredSectors,
    excludedSectors: row.excluded_sectors ?? DEFAULTS.excludedSectors,
    maxVolatility: row.max_volatility ?? DEFAULTS.maxVolatility,
    cryptoExposureLimit: row.crypto_exposure_limit ?? DEFAULTS.cryptoExposureLimit,
    commodityExposureLimit: row.commodity_exposure_limit ?? DEFAULTS.commodityExposureLimit,
    internationalExposureLimit:
      row.international_exposure_limit ?? DEFAULTS.internationalExposureLimit,
    timeHorizon: clampHorizon(row.time_horizon ?? DEFAULTS.timeHorizon),
    minConfidenceScore: row.min_confidence_score ?? DEFAULTS.minConfidenceScore,
    allowIPORecommendations:
      row.allow_ipo_recommendations ?? DEFAULTS.allowIPORecommendations,
    allowEmergingMarkets: row.allow_emerging_markets ?? DEFAULTS.allowEmergingMarkets,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function get(accountId: string): Promise<UserConfig> {
  await init();

  const result = await query<{
    account_id: string;
    conservation_percentage: number;
    risk_percentage: number;
    preferred_sectors: string[];
    excluded_sectors: string[];
    max_volatility: number;
    crypto_exposure_limit: number;
    commodity_exposure_limit: number;
    international_exposure_limit: number;
    time_horizon: string;
    min_confidence_score: number;
    allow_ipo_recommendations: boolean;
    allow_emerging_markets: boolean;
    updated_at: Date;
  }>(
    `SELECT account_id, conservation_percentage, risk_percentage,
            preferred_sectors, excluded_sectors, max_volatility,
            crypto_exposure_limit, commodity_exposure_limit, international_exposure_limit,
            time_horizon, min_confidence_score, allow_ipo_recommendations,
            allow_emerging_markets, updated_at
     FROM user_config WHERE account_id = $1`,
    [accountId]
  );

  const row = result.rows[0];

  if (!row) {
    return {
      accountId,
      ...DEFAULTS,
      updatedAt: new Date().toISOString(),
    };
  }

  return rowToConfig(row);
}

export type UserConfigUpdate = Partial<
  Omit<UserConfig, 'accountId' | 'updatedAt'>
>;

export async function set(
  accountId: string,
  values: UserConfigUpdate
): Promise<UserConfig> {
  await init();

  const current = await get(accountId);

  const next = {
    conservationPercentage: clampPercentage(
      values.conservationPercentage ?? current.conservationPercentage
    ),
    riskPercentage: clampPercentage(values.riskPercentage ?? current.riskPercentage),
    preferredSectors: values.preferredSectors ?? current.preferredSectors,
    excludedSectors: values.excludedSectors ?? current.excludedSectors,
    maxVolatility: clampPercentage(values.maxVolatility ?? current.maxVolatility),
    cryptoExposureLimit: clampPercentage(
      values.cryptoExposureLimit ?? current.cryptoExposureLimit
    ),
    commodityExposureLimit: clampPercentage(
      values.commodityExposureLimit ?? current.commodityExposureLimit
    ),
    internationalExposureLimit: clampPercentage(
      values.internationalExposureLimit ?? current.internationalExposureLimit
    ),
    timeHorizon: values.timeHorizon
      ? clampHorizon(values.timeHorizon)
      : current.timeHorizon,
    minConfidenceScore: clampPercentage(
      values.minConfidenceScore ?? current.minConfidenceScore
    ),
    allowIPORecommendations:
      values.allowIPORecommendations ?? current.allowIPORecommendations,
    allowEmergingMarkets:
      values.allowEmergingMarkets ?? current.allowEmergingMarkets,
  };

  await query(
    `INSERT INTO user_config (
      account_id, conservation_percentage, risk_percentage,
      preferred_sectors, excluded_sectors, max_volatility,
      crypto_exposure_limit, commodity_exposure_limit, international_exposure_limit,
      time_horizon, min_confidence_score, allow_ipo_recommendations,
      allow_emerging_markets, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (account_id) DO UPDATE SET
      conservation_percentage = EXCLUDED.conservation_percentage,
      risk_percentage = EXCLUDED.risk_percentage,
      preferred_sectors = EXCLUDED.preferred_sectors,
      excluded_sectors = EXCLUDED.excluded_sectors,
      max_volatility = EXCLUDED.max_volatility,
      crypto_exposure_limit = EXCLUDED.crypto_exposure_limit,
      commodity_exposure_limit = EXCLUDED.commodity_exposure_limit,
      international_exposure_limit = EXCLUDED.international_exposure_limit,
      time_horizon = EXCLUDED.time_horizon,
      min_confidence_score = EXCLUDED.min_confidence_score,
      allow_ipo_recommendations = EXCLUDED.allow_ipo_recommendations,
      allow_emerging_markets = EXCLUDED.allow_emerging_markets,
      updated_at = NOW()`,
    [
      accountId,
      next.conservationPercentage,
      next.riskPercentage,
      next.preferredSectors,
      next.excludedSectors,
      next.maxVolatility,
      next.cryptoExposureLimit,
      next.commodityExposureLimit,
      next.internationalExposureLimit,
      next.timeHorizon,
      next.minConfidenceScore,
      next.allowIPORecommendations,
      next.allowEmergingMarkets,
    ]
  );

  return get(accountId);
}

export function horizonToLabel(horizon: TimeHorizon): string {
  const map: Record<TimeHorizon, string> = {
    '1M': '1 month',
    '3M': '3 months',
    '6M': '6 months',
    '1Y': '12 months',
    '5Y': '5 years',
  };
  return map[horizon];
}
