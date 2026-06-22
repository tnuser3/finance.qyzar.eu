import type { Listener } from '../listeners';
import { requestRevalidationCode } from '../auth/accounts';
import { asRecord, asString, reply } from '../ws/reply';

const config: Listener = {
  event: 'requestRevalidation',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const email = asString(payload.email);
    if (!email) {
      reply(ws, {
        event: 'requestRevalidation',
        ok: false,
        error: 'email is required',
      });
      return;
    }

    await requestRevalidationCode(email);

    reply(ws, {
      event: 'requestRevalidation',
      ok: true,
    });
  },
};

export default config;
