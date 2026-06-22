const DEFAULT_WS_URL = "ws://localhost:3799";
const DEFAULT_TIMEOUT_MS = 20_000;

type WsPayload = Record<string, unknown> & {
  event?: string;
  ok?: boolean;
  error?: string;
  cache?: {
    fromCache?: boolean;
    cachedAt?: string;
    expiresAt?: string;
    ttlMs?: number;
    stale?: boolean;
  };
};

export interface WsRequestOptions {
  timeoutMs?: number;
  bypassCache?: boolean;
  refresh?: boolean;
}

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

function wsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL;
}

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class WsClient {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRequest<WsPayload>[]>();

  private ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl());
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.connectPromise = null;
        resolve();
      });

      socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener("close", () => {
        this.socket = null;
        this.connectPromise = null;
        this.rejectAllPending(new Error("websocket disconnected"));
      });

      socket.addEventListener("error", () => {
        this.connectPromise = null;
        reject(new Error("websocket connection failed"));
      });
    });

    return this.connectPromise;
  }

  private handleMessage(raw: unknown): void {
    let payload: WsPayload;

    try {
      payload =
        typeof raw === "string"
          ? (JSON.parse(raw) as WsPayload)
          : (raw as WsPayload);
    } catch {
      return;
    }

    const event = payload.event;
    if (!event) return;

    const queue = this.pending.get(event);
    const next = queue?.shift();

    if (!next) return;

    if (queue && queue.length === 0) {
      this.pending.delete(event);
    }

    clearTimeout(next.timeoutId);

    if (payload.ok === false) {
      next.reject(new Error(String(payload.error ?? "request failed")));
      return;
    }

    next.resolve(payload);
  }

  private rejectAllPending(error: Error): void {
    for (const [, queue] of this.pending) {
      for (const pending of queue) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
    }

    this.pending.clear();
  }

  async request<T extends WsPayload>(
    event: string,
    payload: Record<string, unknown> = {},
    options: WsRequestOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    await this.ensureConnected();

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("websocket is not connected");
    }

    const requestPayload = {
      ...payload,
      ...(options.bypassCache ? { bypassCache: true } : {}),
      ...(options.refresh ? { refresh: true } : {}),
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const queue = this.pending.get(event);
        if (!queue) return;

        const index = queue.findIndex((entry) => entry.timeoutId === timeoutId);
        if (index >= 0) queue.splice(index, 1);
        if (queue.length === 0) this.pending.delete(event);

        reject(new Error(`websocket request timed out (${event})`));
      }, timeoutMs);

      const queue = this.pending.get(event) ?? [];
      queue.push({
        resolve: resolve as (value: WsPayload) => void,
        reject,
        timeoutId,
      });
      this.pending.set(event, queue);

      this.socket!.send(
        JSON.stringify({
          event,
          requestId: createRequestId(),
          ...requestPayload,
        })
      );
    });
  }
}

export const wsClient = new WsClient();
