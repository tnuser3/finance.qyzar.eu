import { Pool, type QueryResult, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

function getConnectionString(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && !databaseUrl.includes('${')) {
    return databaseUrl;
  }

  const url = process.env.postgres_url;
  if (url && !url.includes('${')) {
    return url;
  }

  const user = process.env.postgres_user ?? process.env.PGUSER ?? 'postgres';
  const password =
    process.env.postgres_password ?? process.env.PGPASSWORD ?? 'postgres';
  const host = process.env.postgres_host ?? process.env.PGHOST ?? 'localhost';
  const port = process.env.postgres_port ?? process.env.PGPORT ?? '5432';
  const database =
    process.env.postgres_database ?? process.env.PGDATABASE ?? 'postgres';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getConnectionString() });
  }

  return pool;
}

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<R>> {
  return getPool().query<R>(text, params);
}

export function toJsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export async function close(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
