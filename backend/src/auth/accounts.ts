import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { query } from '../infra/db/pool';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface Account {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResult {
  account: Account;
  token: string;
}

let initialized = false;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');

  if (!salt || !hash) {
    return false;
  }

  const hashBuffer = Buffer.from(hash, 'hex');
  const derived = scryptSync(password, salt, 64);

  return timingSafeEqual(hashBuffer, derived);
}

function toAccount(row: {
  id: string;
  email: string;
  created_at: Date;
}): Account {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

// DEV ONLY stub — replace with a real email sender (e.g. SendGrid, Resend, SES).
// In production this is called on revalidate / requestRevalidation events.
// The code must be delivered out-of-band; logging it to stdout is a security risk.
async function sendRevalidationEmail(_email: string, _code: string): Promise<void> {
  throw new Error('sendRevalidationEmail is not implemented. Wire up a transactional email provider.');
}

export async function init(): Promise<void> {
  if (initialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_email
      ON accounts (email);
  `);

  await initTokenStore();
  initialized = true;
}

export async function signup(email: string, password: string): Promise<AuthResult> {
  await init();

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    throw new AuthError('email and password are required');
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM accounts WHERE email = $1`,
    [normalizedEmail]
  );

  if (existing.rows[0]) {
    throw new AuthError('email already registered');
  }

  const accountId = randomUUID();
  const passwordHash = hashPassword(password);

  const result = await query<{
    id: string;
    email: string;
    created_at: Date;
  }>(
    `INSERT INTO accounts (id, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, created_at`,
    [accountId, normalizedEmail, passwordHash]
  );

  const account = toAccount(result.rows[0]);
  const authToken = await dispatchAuthToken(account.id);

  return { account, token: authToken };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  await init();

  const normalizedEmail = normalizeEmail(email);

  const result = await query<{
    id: string;
    email: string;
    password_hash: string;
    created_at: Date;
  }>(`SELECT id, email, password_hash, created_at FROM accounts WHERE email = $1`, [
    normalizedEmail,
  ]);

  const row = result.rows[0];

  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new AuthError('invalid email or password');
  }

  const account = toAccount(row);
  const authToken = await dispatchAuthToken(account.id);

  return { account, token: authToken };
}

export async function getById(accountId: string): Promise<Account | null> {
  await init();

  const result = await query<{
    id: string;
    email: string;
    created_at: Date;
  }>(`SELECT id, email, created_at FROM accounts WHERE id = $1`, [accountId]);

  const row = result.rows[0];

  return row ? toAccount(row) : null;
}

export async function getByEmail(email: string): Promise<Account | null> {
  await init();

  const result = await query<{
    id: string;
    email: string;
    created_at: Date;
  }>(`SELECT id, email, created_at FROM accounts WHERE email = $1`, [
    normalizeEmail(email),
  ]);

  const row = result.rows[0];

  return row ? toAccount(row) : null;
}

export async function requestRevalidationCode(email: string): Promise<void> {
  await init();

  const account = await getByEmail(email);

  if (!account) {
    return;
  }

  const code = await issueRevalidationCode(account.id);
  await sendRevalidationEmail(account.email, code);
}

export async function revalidateFromCode(
  email: string,
  code: string
): Promise<AuthResult> {
  await init();

  const account = await getByEmail(email);

  if (!account) {
    throw new AuthError('invalid email or code');
  }

  const authToken = await revalidateAuthToken(account.id, code);

  if (!authToken) {
    throw new AuthError('invalid email or code');
  }

  return { account, token: authToken };
}

function getPublicAccount(): Account {
  return {
    id: process.env.SYSTEM_ACCOUNT_ID ?? '00000000-0000-0000-0000-000000000001',
    email: 'public@local',
    createdAt: '1970-01-01T00:00:00.000Z',
  };
}

export async function verifyToken(authToken?: string | null): Promise<Account> {
  await init();

  if (authToken) {
    const accountId = await verifyAuthToken(authToken);

    if (accountId) {
      const account = await getById(accountId);
      if (account) {
        return account;
      }
    }
  }

  return getPublicAccount();
}

export async function logout(authToken: string): Promise<void> {
  await init();
  await revokeAuthToken(authToken);
}

let tokenStoreInitialized = false;

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function initTokenStore(): Promise<void> {
  if (tokenStoreInitialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS account_tokens (
      id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_account_tokens_account_id
      ON account_tokens (account_id);

    CREATE INDEX IF NOT EXISTS idx_account_tokens_expires_at
      ON account_tokens (expires_at);

    CREATE TABLE IF NOT EXISTS account_email_codes (
      id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_account_email_codes_account_id
      ON account_email_codes (account_id);
  `);

  tokenStoreInitialized = true;
}

export async function dispatchAuthToken(accountId: string): Promise<string> {
  await init();

  const token = generateToken();
  const tokenHash = hashValue(token);

  await query(
    `INSERT INTO account_tokens (id, account_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '31 days')`,
    [randomUUID(), accountId, tokenHash]
  );

  return token;
}

export async function verifyAuthToken(token: string): Promise<string | null> {
  await init();

  const tokenHash = hashValue(token);
  const result = await query<{ account_id: string }>(
    `SELECT account_id
     FROM account_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  return result.rows[0]?.account_id ?? null;
}

export async function revokeAuthToken(token: string): Promise<void> {
  await init();

  const tokenHash = hashValue(token);
  await query(`DELETE FROM account_tokens WHERE token_hash = $1`, [tokenHash]);
}

export async function issueRevalidationCode(accountId: string): Promise<string> {
  await init();

  const code = generateCode();
  const codeHash = hashValue(code);

  await query(
    `INSERT INTO account_email_codes (id, account_id, code_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
    [randomUUID(), accountId, codeHash]
  );

  return code;
}

export async function revalidateAuthToken(accountId: string, code: string): Promise<string | null> {
  await init();

  const codeHash = hashValue(code);
  const result = await query<{ id: string }>(
    `SELECT id
     FROM account_email_codes
     WHERE account_id = $1
       AND code_hash = $2
       AND used_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [accountId, codeHash]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await query(`UPDATE account_email_codes SET used_at = NOW() WHERE id = $1`, [
    row.id,
  ]);

  return dispatchAuthToken(accountId);
}
