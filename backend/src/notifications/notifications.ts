import { randomUUID } from 'crypto';
import * as fcm from './fcm';
import { query } from '../infra/db/pool';

export interface Notification {
  id: string;
  accountId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface CreateNotificationInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sendPush?: boolean;
}

let initialized = false;

function toNotification(row: {
  id: string;
  account_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
}): Notification {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

function toPushData(data: Record<string, unknown>): Record<string, string> {
  const pushData: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      continue;
    }

    pushData[key] =
      typeof value === 'string' ? value : JSON.stringify(value);
  }

  return pushData;
}

export async function init(): Promise<void> {
  if (initialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_account_id
      ON notifications (account_id);

    CREATE INDEX IF NOT EXISTS idx_notifications_account_unread
      ON notifications (account_id, read_at)
      WHERE read_at IS NULL;
  `);

  await fcm.init();
  initialized = true;
}

export async function create(
  accountId: string,
  input: CreateNotificationInput
): Promise<Notification> {
  await init();

  const title = input.title.trim();
  const body = input.body.trim();
  const data = input.data ?? {};

  if (!title || !body) {
    throw new Error('title and body are required');
  }

  const result = await query<{
    id: string;
    account_id: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `INSERT INTO notifications (id, account_id, title, body, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, account_id, title, body, data, read_at, created_at`,
    [randomUUID(), accountId, title, body, JSON.stringify(data)]
  );

  const notification = toNotification(result.rows[0]);

  if (input.sendPush !== false) {
    await fcm.sendPush(accountId, {
      title,
      body,
      data: {
        ...toPushData(data),
        notificationId: notification.id,
      },
    });
  }

  return notification;
}

export async function list(
  accountId: string,
  options: { limit?: number; unreadOnly?: boolean } = {}
): Promise<Notification[]> {
  await init();

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const unreadOnly = options.unreadOnly ?? false;

  const result = await query<{
    id: string;
    account_id: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, account_id, title, body, data, read_at, created_at
     FROM notifications
     WHERE account_id = $1
       AND ($2::boolean = false OR read_at IS NULL)
     ORDER BY created_at DESC
     LIMIT $3`,
    [accountId, unreadOnly, limit]
  );

  return result.rows.map(toNotification);
}

export async function countUnread(accountId: string): Promise<number> {
  await init();

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM notifications
     WHERE account_id = $1 AND read_at IS NULL`,
    [accountId]
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function markRead(
  accountId: string,
  notificationId: string
): Promise<Notification | null> {
  await init();

  const result = await query<{
    id: string;
    account_id: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE id = $1 AND account_id = $2 AND read_at IS NULL
     RETURNING id, account_id, title, body, data, read_at, created_at`,
    [notificationId, accountId]
  );

  const row = result.rows[0];

  return row ? toNotification(row) : null;
}

export async function markAllRead(accountId: string): Promise<number> {
  await init();

  const result = await query<{ count: string }>(
    `WITH updated AS (
       UPDATE notifications
       SET read_at = NOW()
       WHERE account_id = $1 AND read_at IS NULL
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM updated`,
    [accountId]
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function send(
  accountId: string,
  input: CreateNotificationInput
): Promise<Notification> {
  return create(accountId, input);
}

export { registerToken, removeToken, listTokens } from './fcm';

export async function registerDeviceFromPayload(
  accountId: string,
  payload: {
    fcmToken?: string;
    deviceId?: string;
    platform?: string;
  }
): Promise<void> {
  const fcmToken = payload.fcmToken?.trim();

  if (!fcmToken) {
    return;
  }

  await fcm.registerToken(accountId, {
    token: fcmToken,
    deviceId: payload.deviceId?.trim() || undefined,
    platform: payload.platform?.trim() || undefined,
  });
}
