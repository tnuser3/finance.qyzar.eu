import type { Listener } from '../listeners';
import { getTimelineById } from '../domain/timeline/timeline';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'getTimelineEntry',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const id = asString(payload.id);
    if (!id) {
      reply(ws, {
        event: 'getTimelineEntry',
        ok: false,
        error: 'id is required',
      });
      return;
    }
    try {
    const event = await getTimelineById(id);
    if (!event) {
        reply(ws, {
          event: 'getTimelineEntry',
          ok: false,
          error: 'timeline entry not found',
        });
        return;
      }

      reply(ws, {
        event: 'getTimelineEntry',
        ok: true,
        entry: event,
      });
    } catch (error) {
      logError(error, { source: 'listeners/get-timeline-entry.ts - getTimelineEntry' });
      reply(ws, {
        event: 'getTimelineEntry',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load timeline entry',
      });
    }
  },
};

export default config;
