import { PgBoss } from "pg-boss";
import { createDb } from "../database/client.js";
import { createGitHubClient } from "../services/github/index.js";
import { registerJobs } from "./jobs.js";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };

const { db, pool } = createDb(need("DATABASE_URL"));
const boss = new PgBoss(need("DATABASE_URL"));
boss.on("error", (e) => console.error(JSON.stringify({ level: "error", msg: "pg-boss", err: String(e) })));
await boss.start();

const gh = createGitHubClient({ appId: need("GITHUB_APP_ID"), privateKey: need("GITHUB_APP_PRIVATE_KEY") });
await registerJobs(boss, db, gh);
console.log(JSON.stringify({ level: "info", msg: "worker started" }));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => { await boss.stop({ graceful: true }); await pool.end(); process.exit(0); });
}
