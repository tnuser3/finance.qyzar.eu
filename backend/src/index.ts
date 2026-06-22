import 'dotenv/config';
import { randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { call } from './listeners';
import { seedNasdaqWatchlistIfNeeded } from './domain/watchlist/nasdaq-seed';
import { startScheduler } from './scheduler';
import * as rooms from './ws/rooms';
import { logError } from './infra/db/error-log';

const Clients = new Map<string, WebSocket>();

export default function listen() {
  const port = Number(process.env.WS_PORT ?? process.env.ws_port ?? 3000);
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    Clients.set(clientId, ws);
    rooms.registerClient(clientId, ws);
    console.log(`client connected: ${clientId}`);

    ws.on('message', (data) => {
        let str: string;

        if (typeof data === 'string') {
            str = data;
        } else if (data instanceof Buffer) {
            str = data.toString();
        } else if (data instanceof ArrayBuffer) {
            str = Buffer.from(data).toString();
        } else if (Array.isArray(data) && data.every(item => item instanceof Buffer)) {
            str = Buffer.concat(data).toString();
        } else {
            str = data?.toString?.() || JSON.stringify(data);
        }

        let json;
        try {
            json = JSON.parse(str);
        } catch (error) {
          logError(error, { source: 'index.ts - listen' });
          console.error(`Invalid JSON from client ${clientId}:`, str);
            return;
        }
        if (!json.event) return;

        call(json.event, json, { ws, clientId });

        console.log(`message from ${clientId}:`, str);
    });

    ws.on('close', () => {
      Clients.delete(clientId);
      rooms.unregisterClient(clientId);
      console.log(`client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      console.error(`client error (${clientId}):`, error);
    });
  });

  wss.on('listening', () => {
    console.log(`websocket server listening on port ${port}`);
    startScheduler();

    void seedNasdaqWatchlistIfNeeded()
      .then((result) => {
        if (result.skipped) {
          console.log('[watchlist] NASDAQ seed skipped (recently seeded or disabled)');
          return;
        }

        if (!result.ok) {
          console.error(`[watchlist] NASDAQ seed failed: ${result.error ?? 'unknown error'}`);
          return;
        }

        console.log(
          `[watchlist] NASDAQ seed complete: ${result.upserted} companies via ${result.source}`
        );
      })
      .catch((error) => {
        logError(error, { source: 'index.ts - listen' });
        console.error(
          '[watchlist] NASDAQ seed error:',
          error instanceof Error ? error.message : error
        );
      });
  });

  return wss;
}

listen();
