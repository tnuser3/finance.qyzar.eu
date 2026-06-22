import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import * as notifications from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'sendNotification',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const title = asString(payload.title);
    const body = asString(payload.body);
    if (!title || !body) {
      reply(ws, {
        event: 'sendNotification',
        ok: false,
        error: 'title and body are required',
      });
      return;
    }
    const extraData =
      typeof payload.data === 'object' && payload.data !== null
        ? (payload.data as Record<string, unknown>)
        : undefined;
    try {
    const notification = await notifications.send(getSystemAccountId(), {
        title,
        body,
        data: extraData,
        sendPush: payload.sendPush !== false,
      });

      reply(ws, {
        event: 'sendNotification',
        ok: true,
        notification,
      });
    } catch (error) {
      logError(error, { source: 'listeners/send-notification.ts - sendNotification' });
      reply(ws, {
        event: 'sendNotification',
        ok: false,
        error: error instanceof Error ? error.message : 'send failed',
      });
    }
  },
};

export default config;
