import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import * as notifications from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';

const config: Listener = {
  event: 'markNotificationRead',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const notificationId = asString(payload.notificationId);
    const markAll = payload.all === true;
    if (markAll) {
    const marked = await notifications.markAllRead(getSystemAccountId());

      reply(ws, {
        event: 'markNotificationRead',
        ok: true,
        marked,
      });
      return;
    }
    if (!notificationId) {
      reply(ws, {
        event: 'markNotificationRead',
        ok: false,
        error: 'notificationId is required',
      });
      return;
    }
    const notification = await notifications.markRead(getSystemAccountId(), notificationId);
    if (!notification) {
      reply(ws, {
        event: 'markNotificationRead',
        ok: false,
        error: 'notification not found',
      });
      return;
    }

    reply(ws, {
      event: 'markNotificationRead',
      ok: true,
      notification,
    });
  },
};

export default config;
