import type { Listener } from '../listeners';
import { verifyToken } from '../auth/accounts';
import { asRecord, asString, reply } from '../ws/reply';

const config: Listener = {
  event: 'verifyToken',
  async handler(data, { ws }) {
    const account = await verifyToken(asString(asRecord(data).token));

    reply(ws, {
      event: 'verifyToken',
      ok: true,
      account,
      authDisabled: true,
    });
  },
};

export default config;
