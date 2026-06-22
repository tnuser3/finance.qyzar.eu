import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import { AuthError, revalidateFromCode } from '../auth/accounts';
import { registerDeviceFromPayload } from '../notifications/notifications';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'revalidate',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const email = asString(payload.email);
    const code = asString(payload.code);
    if (!email || !code) {
      reply(ws, {
        event: 'revalidate',
        ok: false,
        error: 'email and code are required',
      });
      return;
    }
    try {
    const result = await revalidateFromCode(email, code);
      await registerDeviceFromPayload(result.account.id, {
        fcmToken: asString(payload.fcmToken),
        deviceId: asString(payload.deviceId),
        platform: asString(payload.platform),
      });

      reply(ws, {
        event: 'revalidate',
        ok: true,
        account: result.account,
        token: result.token,
      });
    } catch (error) {
      logError(error, { source: 'listeners/revalidate.ts - revalidate' });
    const message =
        error instanceof AuthError ? error.message : 'revalidation failed';

      reply(ws, {
        event: 'revalidate',
        ok: false,
        error: message,
      });
    }
  },
};

export default config;
