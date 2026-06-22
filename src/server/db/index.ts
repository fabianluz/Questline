import "server-only";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Two backends, one `db`:
 *
 *  - Server / dev mode (default): PostgreSQL via postgres-js, using DATABASE_URL.
 *  - Embedded mode (the desktop app): an in-process, file-backed PostgreSQL
 *    (PGlite). No Docker, no external DB server — the whole database lives in a
 *    folder. Enabled with QUESTLINE_EMBEDDED=1; data dir from QUESTLINE_DATA_DIR.
 *
 * pgvector is not used anywhere in the schema, so PGlite is a drop-in. Both
 * drivers expose the same Drizzle query API, so the rest of the app stays
 * backend-agnostic behind a single `PostgresJsDatabase`-typed handle.
 */

const embedded = process.env.QUESTLINE_EMBEDDED === "1";

// Keep the concrete PGlite handle so the migrator can use it on boot.
let _pgliteDb: PgliteDatabase<typeof schema> | null = null;

function makeDb(): PostgresJsDatabase<typeof schema> {
  if (embedded) {
    const dataDir =
      process.env.QUESTLINE_DATA_DIR || path.join(process.cwd(), ".questline-data");
    const client = new PGlite(dataDir);
    _pgliteDb = drizzlePglite(client, { schema });
    // Runtime query API is identical; the cast keeps the app's types stable.
    return _pgliteDb as unknown as PostgresJsDatabase<typeof schema>;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(connectionString, { max: 10 });
  return drizzlePg(client, { schema });
}

export const db = makeDb();
export type DB = typeof db;

/**
 * In embedded mode, apply the Drizzle migrations to the PGlite database. Safe to
 * call repeatedly — the migrator tracks what's already applied. No-op for the
 * Postgres backend (there, migrations run via `drizzle-kit migrate`).
 */
export async function ensureEmbeddedMigrations(): Promise<void> {
  if (!embedded || !_pgliteDb) return;
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const migrationsFolder =
    process.env.QUESTLINE_MIGRATIONS_DIR || path.join(process.cwd(), "drizzle");
  await migrate(_pgliteDb, { migrationsFolder });
}
