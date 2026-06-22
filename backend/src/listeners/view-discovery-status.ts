import type { Listener } from '../listeners';
import * as rooms from '../ws/rooms';
import { getDiscoverySnapshot } from '../domain/ops/discovery-status';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'viewDiscoveryStatus',
  async handler(data, { ws, clientId }) {
    const payload = asRecord(data);    const subscribe = payload.subscribe !== false;
    try {
      rooms.registerClient(clientId, ws);
    if (subscribe) {
        rooms.subscribe(clientId, 'discovery');
      } else {
        rooms.unsubscribe(clientId, 'discovery');
      }
    const snapshot = await getDiscoverySnapshot();

      reply(ws, {
        event: 'viewDiscoveryStatus',
        type: 'snapshot',
        ok: true,
        subscribed: subscribe,
        room: 'discovery',
        ...snapshot,
        idleMessage: snapshot.running
          ? null
          : snapshot.countdown
            ? `Discovery is idle. Next scheduled run in ${snapshot.countdown.label}.`
            : 'Discovery is idle. Scheduler timing unavailable.',
      });
    } catch (error) {
      logError(error, { source: 'listeners/view-discovery-status.ts - viewDiscoveryStatus' });
      reply(ws, {
        event: 'viewDiscoveryStatus',
        ok: false,
        error: error instanceof Error ? error.message : 'failed to load discovery status',
      });
    }
  },
};

export default config;
