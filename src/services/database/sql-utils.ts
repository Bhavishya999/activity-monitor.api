import { sql, type SQL } from "drizzle-orm";

/** drizzle's raw execute hands timestamps back as driver strings, so format them as ISO-8601 UTC in SQL. */
export function isoUtc(column: SQL): SQL {
  return sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}
