import type { Listener } from '../listeners';
import { runAgent } from '../agents';
import { logActivity, formatRundownMessage } from '../domain/ops/activity-log';
import { asRecord, asString, reply } from '../ws/reply';
import { logError } from '../infra/db/error-log';

const config: Listener = {
  event: 'agent',
  async handler(data, { ws }) {
    const payload = asRecord(data);
    const message = asString(payload.message);
    const model = asString(payload.model) || 'gpt-4';
    if (!message) {
      reply(ws, {
        event: 'agent',
        type: 'error',
        ok: false,
        error: 'message is required',
      });
      return;
    }
    try {
    const result = await runAgent({
        model,
        prompt: message,
        onChunk: (chunk) => {
          reply(ws, {
            event: 'agent',
            type: 'chunk',
            chunk,
          });
        },
        onEvent: (event) => {
    if (event.type === 'chunk') {
            return;
          }

          logActivity({
            source: 'agent',
            type: String(event.type ?? 'update'),
            message: formatRundownMessage(event as Record<string, unknown>),
            data: event as Record<string, unknown>,
          });

          reply(ws, {
            event: 'agent',
            ...event,
          });
        },
      });

      reply(ws, {
        event: 'agent',
        type: 'done',
        ok: result.ok,
        text: result.text,
        indexedCommands: result.indexedCommands,
        commandCalls: result.commandCalls,
        commandResults: result.commandResults,
      });
    } catch (error) {
      logError(error, { source: 'listeners/agent.ts - agent' });
    const errMessage = error instanceof Error ? error.message : 'agent failed';

      reply(ws, {
        event: 'agent',
        type: 'error',
        ok: false,
        error: errMessage,
      });
    }
  },
};

export default config;
