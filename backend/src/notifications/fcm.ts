import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import admin from 'firebase-admin';
import { query } from '../infra/db/pool';

export type DevicePlatform = 'ios' | 'android' | 'web' | 'unknown';

export interface FcmToken {
  id: string;
  accountId: string;
  token: string;
  deviceId: string | null;
  platform: DevicePlatform;
  createdAt: string;
  lastUsedAt: string;
}

export interface RegisterTokenInput {
  token: string;
  deviceId?: string;
  platform?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

let initialized = false;
let firebaseReady = false;

function env(key: string): string {
  return process.env[key] ?? process.env[key.toLowerCase()] ?? '';
}

function normalizePlatform(value: string | undefined): DevicePlatform {
  const platform = (value ?? '').trim().toLowerCase();

  if (platform === 'ios' || platform === 'android' || platform === 'web') {
    return platform;
  }

  return 'unknown';
}

function toFcmToken(row: {
  id: string;
  account_id: string;
  token: string;
  device_id: string | null;
  platform: string;
  created_at: Date;
  last_used_at: Date;
}): FcmToken {
  return {
    id: row.id,
    accountId: row.account_id,
    token: row.token,
    deviceId: row.device_id,
    platform: normalizePlatform(row.platform),
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at.toISOString(),
  };
}

function initFirebase(): void {
  if (firebaseReady || admin.apps.length > 0) {
    firebaseReady = true;
    return;
  }

  const serviceAccountPath = env('FIREBASE_SERVICE_ACCOUNT_PATH');

  if (serviceAccountPath) {
    const raw = readFileSync(serviceAccountPath, 'utf8');
    const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseReady = true;
    return;
  }

  const projectId = env('FIREBASE_PROJECT_ID');
  const clientEmail = env('FIREBASE_CLIENT_EMAIL');
  const privateKey = env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    firebaseReady = true;
  }
}

export async function init(): Promise<void> {
  if (initialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      token TEXT NOT NULL UNIQUE,
      device_id TEXT,
      platform TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_fcm_tokens_account_id
      ON fcm_tokens (account_id);
  `);

  initFirebase();
  initialized = true;
}

export async function registerToken(
  accountId: string,
  input: RegisterTokenInput
): Promise<FcmToken> {
  await init();

  const token = input.token.trim();
  const deviceId = input.deviceId?.trim() || null;
  const platform = normalizePlatform(input.platform);

  if (!token) {
    throw new Error('fcm token is required');
  }

  const existing = await query<{
    id: string;
    account_id: string;
    token: string;
    device_id: string | null;
    platform: string;
    created_at: Date;
    last_used_at: Date;
  }>(
    `SELECT id, account_id, token, device_id, platform, created_at, last_used_at
     FROM fcm_tokens WHERE token = $1`,
    [token]
  );

  if (existing.rows[0]) {
    const result = await query<{
      id: string;
      account_id: string;
      token: string;
      device_id: string | null;
      platform: string;
      created_at: Date;
      last_used_at: Date;
    }>(
      `UPDATE fcm_tokens
       SET account_id = $1,
           device_id = COALESCE($2, device_id),
           platform = $3,
           last_used_at = NOW()
       WHERE token = $4
       RETURNING id, account_id, token, device_id, platform, created_at, last_used_at`,
      [accountId, deviceId, platform, token]
    );

    return toFcmToken(result.rows[0]);
  }

  const result = await query<{
    id: string;
    account_id: string;
    token: string;
    device_id: string | null;
    platform: string;
    created_at: Date;
    last_used_at: Date;
  }>(
    `INSERT INTO fcm_tokens (id, account_id, token, device_id, platform, last_used_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, account_id, token, device_id, platform, created_at, last_used_at`,
    [randomUUID(), accountId, token, deviceId, platform]
  );

  return toFcmToken(result.rows[0]);
}

export async function removeToken(token: string): Promise<void> {
  await init();

  const normalized = token.trim();

  if (!normalized) {
    return;
  }

  await query(`DELETE FROM fcm_tokens WHERE token = $1`, [normalized]);
}

export async function listTokens(accountId: string): Promise<FcmToken[]> {
  await init();

  const result = await query<{
    id: string;
    account_id: string;
    token: string;
    device_id: string | null;
    platform: string;
    created_at: Date;
    last_used_at: Date;
  }>(
    `SELECT id, account_id, token, device_id, platform, created_at, last_used_at
     FROM fcm_tokens
     WHERE account_id = $1
     ORDER BY last_used_at DESC`,
    [accountId]
  );

  return result.rows.map(toFcmToken);
}

export async function sendPush(
  accountId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; pruned: number }> {
  await init();

  const tokens = await listTokens(accountId);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  if (!firebaseReady) {
    console.warn('[fcm] firebase not configured — skipping push delivery');
    return { sent: 0, failed: tokens.length, pruned: 0 };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: tokens.map((entry) => entry.token),
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
    android: {
      priority: 'high',
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  });

  let pruned = 0;

  await Promise.all(
    response.responses.map(async (item, index) => {
      if (item.success) {
        return;
      }

      const code = item.error?.code;

      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        await removeToken(tokens[index].token);
        pruned += 1;
      }
    })
  );

  return {
    sent: response.successCount,
    failed: response.failureCount,
    pruned,
  };
}

export function isConfigured(): boolean {
  initFirebase();
  return firebaseReady;
}
