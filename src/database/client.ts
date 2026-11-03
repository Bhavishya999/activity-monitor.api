import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

export * as schema from "./schema/index.js";
export type Db = NodePgDatabase<typeof schema>;

// node-postgres returns bigint (int8) as a string. GitHub ids and our counts stay far below 2^53, so parse them as
// numbers once here; otherwise raw SQL results leak string ids into API responses.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value));

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
