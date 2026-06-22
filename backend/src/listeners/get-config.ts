import type { Listener } from '../listeners';
import { getSystemAccountId } from '../agents/policy';
import * as userConfig from '../auth/config';
import { asRecord, reply } from '../ws/reply';

const config: Listener = {
  event: 'getConfig',
  async handler(data, { ws }) {
    const userCfg = await userConfig.get(getSystemAccountId());

    reply(ws, {
      event: 'getConfig',
      ok: true,
      config: userCfg,
    });
  },
};

export default config;
