import type { Listener } from '../listeners';
import {
  buildTimelineGroups,
  getTimelineById,
  getTimelineForCorrelation,
  listTimeline,
} from '../domain/timeline/timeline';
import type { TimelineEventType } from '../agents/definitions/types';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

function parseEventType(value: string): TimelineEventType | undefined {
  const types: TimelineEventType[] = [
    'correlation',
    'news',
    'price_move',
    'price_point',
    'monitoring_snapshot',
  ];
  return types.includes(value as TimelineEventType)
    ? (value as TimelineEventType)
    : undefined;
}

const config: Listener = {
  event: 'viewTimeline',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const from = asString(payload.from) || undefined;
    const to = asString(payload.to) || undefined;
    const ticker = asString(payload.ticker).trim().toUpperCase() || undefined;
    const correlationId = asString(payload.correlationId) || undefined;
    const eventTypeRaw = asString(payload.eventType);
    const eventType = eventTypeRaw ? parseEventType(eventTypeRaw) : undefined;
    const limit = Number(payload.limit) || 100;
    const order = asString(payload.order) === 'asc' ? 'asc' : 'desc';
    const grouped = payload.grouped === true;
    try {
    const events = await listTimeline({
        from,
        to,
        ticker,
        eventType,
        correlationId,
        limit,
        order,
      });

      reply(ws, {
        event: 'viewTimeline',
        ok: true,
        count: events.length,
        events,
        groups: grouped ? buildTimelineGroups(events) : undefined,
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-timeline.ts - viewTimeline' });
      reply(ws, {
        event: 'viewTimeline',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load timeline',
      });
    }
  },
};

export default config;
