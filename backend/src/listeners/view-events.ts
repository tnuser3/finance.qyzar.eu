import type { Listener } from '../listeners';
import * as events from '../domain/events/store';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const STATUSES = new Set(['pending', 'processing', 'done', 'skipped']);
const SEVERITIES = new Set(['low', 'medium', 'high']);
const EVENT_TYPES = new Set(['regulatory', 'news', 'sentiment', 'market']);

const config: Listener = {
  event: 'viewEvents',
  async handler(data, { ws }) {
    const payload = asRecord(data);

    try {
      const limit = Number(payload.limit) || 100;
      const offset = Number(payload.offset) || 0;
      const statusRaw = asString(payload.status);
      const severityRaw = asString(payload.severity);
      const eventTypeRaw = asString(payload.eventType);
      const status = STATUSES.has(statusRaw) ? (statusRaw as events.EventStatus) : undefined;
      const severity = SEVERITIES.has(severityRaw)
        ? (severityRaw as events.EventSeverity)
        : undefined;
      const eventType = EVENT_TYPES.has(eventTypeRaw)
        ? (eventTypeRaw as events.EventType)
        : undefined;

      const filters = {
        limit,
        offset,
        status,
        severity,
        eventType,
        source: asString(payload.source) || undefined,
        ticker: asString(payload.ticker).trim().toUpperCase() || undefined,
        companyId: asString(payload.companyId) || undefined,
        from: asString(payload.from) || undefined,
        to: asString(payload.to) || undefined,
      };

      const [items, total] = await Promise.all([
        events.listEvents(filters),
        events.countEvents(filters),
      ]);

      reply(ws, {
        event: 'viewEvents',
        ok: true,
        count: items.length,
        total,
        offset,
        limit,
        events: items,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-events.ts - viewEvents' });
      reply(ws, {
        event: 'viewEvents',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load events',
      });
    }
  },
};

export default config;
