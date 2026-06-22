import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import { AuthError, login } from '../auth/accounts';
import { registerDeviceFromPayload } from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'login',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const email = asString(payload.email);
    const password = asString(payload.password);
    try {
    const result = await login(email, password);
      await registerDeviceFromPayload(result.account.id, {
        fcmToken: asString(payload.fcmToken),
        deviceId: asString(payload.deviceId),
        platform: asString(payload.platform),
      });

      reply(ws, {
        event: 'login',
        ok: true,
        account: result.account,
        token: result.token,
      });
    } catch (error) {
      logError(error, { source: 'listeners/login.ts - login' });
    const message =
        error instanceof AuthError ? error.message : 'login failed';

      reply(ws, {
        event: 'login',
        ok: false,
        error: message,
      });
    }
  },
};

export default config;
