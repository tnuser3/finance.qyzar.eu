import type { Listener } from '../listeners';
import * as rooms from '../ws/rooms';
import { asRecord, asString, reply } from '../ws/reply';

const config: Listener = {
  event: 'unsubscribeRoom',
  handler(data, { ws, clientId }) {
    const payload = asRecord(data);
    const room = asString(payload.room);
    if (!room) {
      reply(ws, {
        event: 'unsubscribeRoom',
        ok: false,
        error: 'room is required',
      });
      return;
    }

    rooms.unsubscribe(clientId, room);

    reply(ws, {
      event: 'unsubscribeRoom',
      ok: true,
      room,
    });
  },
};

export default config;
