import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

export * as schema from "./schema/index.js";
export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string, max = 10): { db: NodePgDatabase<typeof schema>; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString, max });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/** First row or throw: replaces `rows[0]!` for INSERT/UPDATE ... RETURNING and lookups that must exist. */
export function one<T>(rows: readonly T[], what = "row"): T {
  const r = rows[0];
  if (r === undefined) throw new Error(`expected ${what}`);
  return r;
}
