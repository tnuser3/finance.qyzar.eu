import type { Listener } from '../listeners';

const config: Listener = {
  event: 'ping',
  handler(_data) {
    // no-op — pong is handled by the WebSocket layer
  },
};

export default config;
