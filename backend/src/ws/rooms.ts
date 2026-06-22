import type { WebSocket } from 'ws';
import { reply } from './reply';

const roomMembers = new Map<string, Set<string>>();
const clientSockets = new Map<string, WebSocket>();
const clientRooms = new Map<string, Set<string>>();

export function registerClient(clientId: string, ws: WebSocket): void {
  clientSockets.set(clientId, ws);
  if (!clientRooms.has(clientId)) {
    clientRooms.set(clientId, new Set());
  }
}

export function unregisterClient(clientId: string): void {
  const rooms = clientRooms.get(clientId);

  if (rooms) {
    for (const room of rooms) {
      roomMembers.get(room)?.delete(clientId);
      if (roomMembers.get(room)?.size === 0) {
        roomMembers.delete(room);
      }
    }
  }

  clientRooms.delete(clientId);
  clientSockets.delete(clientId);
}

export function subscribe(clientId: string, room: string): void {
  if (!roomMembers.has(room)) {
    roomMembers.set(room, new Set());
  }

  roomMembers.get(room)!.add(clientId);

  if (!clientRooms.has(clientId)) {
    clientRooms.set(clientId, new Set());
  }

  clientRooms.get(clientId)!.add(room);
}

export function unsubscribe(clientId: string, room: string): void {
  roomMembers.get(room)?.delete(clientId);
  clientRooms.get(clientId)?.delete(room);

  if (roomMembers.get(room)?.size === 0) {
    roomMembers.delete(room);
  }
}

export function unsubscribeAll(clientId: string): void {
  const rooms = clientRooms.get(clientId);

  if (!rooms) return;

  for (const room of [...rooms]) {
    unsubscribe(clientId, room);
  }
}

export function broadcast(
  room: string,
  payload: Record<string, unknown>,
  excludeClientId?: string
): number {
  const members = roomMembers.get(room);
  if (!members?.size) return 0;

  let sent = 0;

  for (const clientId of members) {
    if (clientId === excludeClientId) continue;

    const ws = clientSockets.get(clientId);
    if (!ws || ws.readyState !== ws.OPEN) continue;

    reply(ws, payload);
    sent++;
  }

  return sent;
}

export function memberCount(room: string): number {
  return roomMembers.get(room)?.size ?? 0;
}
