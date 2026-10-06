import { createClient, type Client, type InArgs, type InStatement } from "@libsql/client";
import { seedStatements } from "./seed";

/**
 * libSQL = SQLite that also runs as a hosted database (Turso).
 *  - Local dev: no env vars needed, uses the file data/callboard.db
 *  - Vercel:    set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (serverless has no persistent disk)
 */
const URL = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:data/callboard.db";
const TOKEN = process.env.TURSO_AUTH_TOKEN;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name    TEXT NOT NULL,
  business         TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  equipment        TEXT,
  problem          TEXT,
  source           TEXT NOT NULL DEFAULT 'Phone call',
  urgent           INTEGER NOT NULL DEFAULT 0,
  stage            TEXT NOT NULL DEFAULT 'new',
  stage_at         TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  last_contact_at  TEXT,
  first_contact_at TEXT,
  follow_up_on     TEXT,
  quote_amount     REAL,
  scheduled_for    TEXT,
  tech             TEXT,
  lost_reason      TEXT,
  notes            TEXT,
  undo_snapshot    TEXT,
  undo_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_stage ON jobs(stage);
CREATE INDEX IF NOT EXISTS idx_jobs_phone ON jobs(phone);
CREATE TABLE IF NOT EXISTS history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id  INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  at      TEXT NOT NULL,
  text    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_job ON history(job_id);
`;

// One client + one schema/seed run per server instance (survives dev hot reloads).
const g = globalThis as unknown as { __cbClient?: Client; __cbReady?: Promise<void> };

async function init(c: Client) {
  await c.executeMultiple(SCHEMA);
  const r = await c.execute("SELECT COUNT(*) AS n FROM jobs");
  if (Number(r.rows[0].n) === 0 && process.env.SEED_DEMO !== "false") await c.batch(seedStatements(), "write");
}

async function client(): Promise<Client> {
  if (!g.__cbClient) {
    if (URL.startsWith("file:")) {
      const fs = await import("node:fs");
      const path = await import("node:path");
      fs.mkdirSync(path.dirname(URL.slice(5)), { recursive: true });
    }
    g.__cbClient = createClient({ url: URL, authToken: TOKEN });
    g.__cbReady = init(g.__cbClient).catch((e) => { g.__cbReady = undefined; g.__cbClient = undefined; throw e; });
  }
  await g.__cbReady;
  return g.__cbClient!;
}

type Row = Record<string, unknown>;

export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await (await client()).execute({ sql, args });
  return r.rows.map((row) => ({ ...row })) as T[];
}

export async function get<T = Row>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args: InArgs = []) {
  const r = await (await client()).execute({ sql, args });
  return { lastInsertRowid: Number(r.lastInsertRowid ?? 0), rowsAffected: r.rowsAffected };
}

/** Several statements, all-or-nothing. */
export async function tx(statements: InStatement[]) {
  await (await client()).batch(statements, "write");
}
