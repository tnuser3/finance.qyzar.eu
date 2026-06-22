import type { Listener } from '../listeners';
import { withWsCache } from '../ws/cache/ws-cache';
import { autofillCompanies } from '../domain/watchlist/company-search';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'companyAutofill',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const query = asString(payload.query).trim();
    const limit = Math.min(Math.max(Number(payload.limit) || 8, 1), 20);

    if (query.length < 2) {
      reply(ws, {
        event: 'companyAutofill',
        ok: true,
        query,
        suggestions: [],
      });
      return;
    }

    try {
      const { data: result, cache } = await withWsCache({
        event: 'companyAutofill',
        payload,
        keyParts: { query, limit },
        policyContext: { query },
        fetch: () => autofillCompanies(query, limit),
      });

      reply(ws, {
        event: 'companyAutofill',
        ok: true,
        ...result,
        cache,
      });
    } catch (error) {
      logError(error, { source: 'listeners/company-autofill.ts - companyAutofill' });
      reply(ws, {
        event: 'companyAutofill',
        ok: false,
        error: error instanceof Error ? error.message : 'autofill failed',
      });
    }
  },
};

export default config;
