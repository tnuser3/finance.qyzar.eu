import type { Listener } from '../listeners';
import { logout } from '../auth/accounts';
import { removeToken } from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';

const config: Listener = {
  event: 'logout',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const fcmToken = asString(payload.fcmToken);
    const token = asString(payload.token);
    if (!token) {
      reply(ws, {
        event: 'logout',
        ok: false,
        error: 'token is required',
      });
      return;
    }
    if (fcmToken) {
      await removeToken(fcmToken);
    }

    await logout(token);

    reply(ws, {
      event: 'logout',
      ok: true,
    });
  },
};

export default config;
