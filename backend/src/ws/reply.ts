import type { WebSocket } from 'ws';

export function reply(ws: WebSocket, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload));
}

export function asRecord(data: unknown): Record<string, unknown> {
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }

  return {};
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}
