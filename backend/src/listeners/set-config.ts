import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import * as userConfig from '../auth/config';
import type { UserConfigUpdate } from '../auth/config';
import { asRecord, asString, reply } from '../ws/reply';

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map(String);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

const config: Listener = {
  event: 'setConfig',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const updates: UserConfigUpdate = {
      conservationPercentage: asNumber(payload.conservationPercentage),
      riskPercentage: asNumber(payload.riskPercentage),
      preferredSectors: asStringArray(payload.preferredSectors),
      excludedSectors: asStringArray(payload.excludedSectors),
      maxVolatility: asNumber(payload.maxVolatility),
      cryptoExposureLimit: asNumber(payload.cryptoExposureLimit),
      commodityExposureLimit: asNumber(payload.commodityExposureLimit),
      internationalExposureLimit: asNumber(payload.internationalExposureLimit),
      timeHorizon: asString(payload.timeHorizon) as UserConfigUpdate['timeHorizon'],
      minConfidenceScore: asNumber(payload.minConfidenceScore),
      allowIPORecommendations: asBoolean(payload.allowIPORecommendations),
      allowEmergingMarkets: asBoolean(payload.allowEmergingMarkets),
    };
    const updated = await userConfig.set(getSystemAccountId(), updates);

    reply(ws, {
      event: 'setConfig',
      ok: true,
      config: updated,
    });
  },
};

export default config;
