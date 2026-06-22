import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import { registerToken } from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'registerFcmToken',
  async handler(data, { ws }) {
    const payload = asRecord(data);    const fcmToken = asString(payload.fcmToken);
    if (!fcmToken) {
      reply(ws, {
        event: 'registerFcmToken',
        ok: false,
        error: 'fcmToken is required',
      });
      return;
    }
    try {
    const device = await registerToken(getSystemAccountId(), {
        token: fcmToken,
        deviceId: asString(payload.deviceId) || undefined,
        platform: asString(payload.platform) || undefined,
      });

      reply(ws, {
        event: 'registerFcmToken',
        ok: true,
        device,
      });
    } catch (error) {
      logError(error, { source: 'listeners/register-fcm-token.ts - registerFcmToken' });
      reply(ws, {
        event: 'registerFcmToken',
        ok: false,
        error: error instanceof Error ? error.message : 'registration failed',
      });
    }
  },
};

export default config;
