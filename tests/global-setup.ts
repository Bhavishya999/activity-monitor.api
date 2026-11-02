import { runMigrations } from "../src/database/run-migrations.js";
export default async function () {
  await runMigrations(process.env["TEST_DATABASE_URL"] ?? "postgres://gam:gam@localhost:5432/gam_test");
}
