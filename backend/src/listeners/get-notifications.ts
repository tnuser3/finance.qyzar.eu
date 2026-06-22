import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import * as notifications from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';

const config: Listener = {
  event: 'getNotifications',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const unreadOnly = payload.unreadOnly === true;
    const limit =
      typeof payload.limit === 'number' && Number.isFinite(payload.limit)
        ? payload.limit
        : undefined;
    const items = await notifications.list(getSystemAccountId(), { limit, unreadOnly });
    const unreadCount = await notifications.countUnread(getSystemAccountId());

    reply(ws, {
      event: 'getNotifications',
      ok: true,
      notifications: items,
      unreadCount,
    });
  },
};

export default config;
