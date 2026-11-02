import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "postgres://gam:gam@localhost:5432/gam_dev" },
});
