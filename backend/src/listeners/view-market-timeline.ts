import type { Listener } from '../listeners';
import { getById as getCorrelationById } from '../domain/timeline/correlation';
import {
  buildTimelineGroups,
  getTimelineForCorrelation,
  listTimeline,
} from '../domain/timeline/timeline';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewMarketTimeline',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const from = asString(payload.from) || undefined;
    const to = asString(payload.to) || undefined;
    const ticker = asString(payload.ticker).trim().toUpperCase() || undefined;
    const correlationId = asString(payload.correlationId) || undefined;
    const limit = Number(payload.limit) || 100;
    try {
    if (correlationId) {
    const correlation = await getCorrelationById(correlationId);
    const events = await getTimelineForCorrelation(correlationId);

        reply(ws, {
          event: 'viewMarketTimeline',
          ok: true,
          correlationId,
          correlation: correlation ?? null,
          count: events.length,
          events,
          groups: buildTimelineGroups(events),
        });
        return;
      }
    const events = await listTimeline({
        from,
        to,
        ticker,
        limit,
        order: 'asc',
      });
    const correlationEvents = events.filter((e) => e.eventType === 'correlation');

      reply(ws, {
        event: 'viewMarketTimeline',
        ok: true,
        count: events.length,
        correlationCount: correlationEvents.length,
        events,
        groups: buildTimelineGroups(events),
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-market-timeline.ts - viewMarketTimeline' });
      reply(ws, {
        event: 'viewMarketTimeline',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load market timeline',
      });
    }
  },
};

export default config;
