import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { createDb } from "./client.js";

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url, 1);
  try {
    await migrate(db, { migrationsFolder: process.env["MIGRATIONS_DIR"] ?? resolve(process.cwd(), "migrations") });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");
  await runMigrations(url);
  console.log("migrations applied");
}
