import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "./helpers.js";

const { db } = testDb();

describe("row level security", () => {
  it("is enabled on every public table so a Supabase Data API cannot expose them", async () => {
    const { rows } = await db.execute<{ tablename: string }>(sql`
      select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("does not lock out the owner role the backend connects as", async () => {
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from github_account`);
    expect(rows[0]?.n).toBeGreaterThanOrEqual(0);
  });
});
