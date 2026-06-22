import fs from 'fs';
import path from 'path';
import type { WebSocket } from 'ws';
import { enforceAccess } from './ws/ws-access';
import { reply } from './ws/reply';

export interface ListenerContext {
  ws: WebSocket;
  clientId: string;
}

export interface Listener {
  event: string;
  handler: (data: unknown, context: ListenerContext) => void | Promise<void>;
}

const listeners = new Map<string, Listener>();

function loadListeners(): void {
  const dir = path.join(__dirname, 'listeners');

  if (!fs.existsSync(dir)) {
    return;
  }

  for (const file of fs.readdirSync(dir)) {
    if (!/\.tsx?$/.test(file)) {
      continue;
    }

    const modulePath = path.join(dir, file);
    const config = require(modulePath).default as Listener;

    if (!config?.event || typeof config.handler !== 'function') {
      console.warn(`skipping invalid listener config: ${file}`);
      continue;
    }

    listeners.set(config.event, config);
  }
}

loadListeners();

export function retrieve(): Listener[] {
  return Array.from(listeners.values());
}

export async function call(
  event: string,
  data: unknown,
  context: ListenerContext
): Promise<void> {
  const listener = listeners.get(event);

  if (!listener) {
    console.warn(`no listener registered for event: ${event}`);
    return;
  }

  const access = await enforceAccess(event, data);

  if (!access.ok) {
    reply(context.ws, {
      event,
      ok: false,
      error: access.error ?? 'request not allowed',
    });
    return;
  }

  const payload = access.payload ?? data;
  await listener.handler(payload, context);
}
