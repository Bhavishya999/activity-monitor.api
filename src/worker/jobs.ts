import { and, eq } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { one, schema, type Db } from "../database/client.js";
import type { GitHubApi } from "../services/github/index.js";
import { JOBS } from "../constants/jobs.js";
import { vDiscoverJobSchema, vImportJobSchema, vWebhookJobSchema } from "../validations/schemas/jobs/job-schemas.js";
import { discoverRepositories } from "./services/discovery.js";
import { finishSyncRun, importRepository, logSyncError } from "./services/importer.js";
import { classifyImportError } from "../helpers/import-error-helper.js";
import { processWebhookDelivery } from "./services/webhooks.js";

const log = (level: string, msg: string, extra: object = {}) => console.log(JSON.stringify({ level, msg, ...extra }));

const RETRY = { retryLimit: 8, retryDelay: 30, retryBackoff: true };

/** Admin/API entry: create one sync run per monitored repo and queue it. Never imports inline. */
export async function enqueueInstallationImport(boss: PgBoss, db: Db, installationId: number, sinceDays: number | null): Promise<number> {
  const repos = await db.select({ id: schema.repository.id }).from(schema.repository)
    .where(and(eq(schema.repository.installationId, installationId), eq(schema.repository.monitored, true), eq(schema.repository.accessible, true)));
  const since = sinceDays ? new Date(Date.now() - sinceDays * 86_400_000) : null;
  for (const r of repos) {
    const run = one(await db.insert(schema.syncRun).values({ kind: "import", installationId, repositoryId: r.id, sinceDate: since, status: "pending" }).returning({ id: schema.syncRun.id }));
    await boss.send(JOBS.IMPORT, { installationId, repositoryId: r.id, sinceDays, syncRunId: run.id }, { ...RETRY, singletonKey: `import-run-${run.id}` });
  }
  return repos.length;
}

export async function registerJobs(boss: PgBoss, db: Db, gh: GitHubApi): Promise<void> {
  for (const q of Object.values(JOBS)) await boss.createQueue(q);

  await boss.work(JOBS.WEBHOOK, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { deliveryRowId } = vWebhookJobSchema.parse(job.data);
      await processWebhookDelivery(db, gh, deliveryRowId);
    }
  });

  await boss.work(JOBS.DISCOVER, async (jobs) => {
    for (const job of jobs) {
      const { installationId } = vDiscoverJobSchema.parse(job.data);
      const ids = await discoverRepositories(db, gh, installationId);
      log("info", "discovered repositories", { installationId, count: ids.length });
    }
  });

  await boss.work(JOBS.IMPORT, { batchSize: 1 }, async ([job]) => {
    if (!job) return;
    const data = vImportJobSchema.parse(job.data);
    const since = data.sinceDays ? new Date(Date.now() - data.sinceDays * 86_400_000) : null;
    await db.update(schema.syncRun).set({ status: "running", startedAt: new Date() }).where(eq(schema.syncRun.id, data.syncRunId));
    try {
      const r = await importRepository(db, gh, { installationId: data.installationId, repositoryId: data.repositoryId, since, syncRunId: data.syncRunId });
      await finishSyncRun(db, data.syncRunId, "succeeded", r);
      log("info", "import finished", { ...data, ...r });
    } catch (e) {
      const outcome = classifyImportError(e);
      if (outcome.kind === "rate-limit") {
        // Park until the limit resets; checkpoints keep the progress.
        await logSyncError(db, data.syncRunId, data.repositoryId, e, true);
        await db.update(schema.syncRun).set({ status: "pending", rateLimitResetAt: outcome.resetAt }).where(eq(schema.syncRun.id, data.syncRunId));
        await boss.send(JOBS.IMPORT, data, { ...RETRY, startAfter: outcome.resetAt, singletonKey: `import-run-${data.syncRunId}-${outcome.resetAt.getTime()}` });
        log("warn", "rate limited; rescheduled", { syncRunId: data.syncRunId, resetAt: outcome.resetAt });
        return;
      }
      await logSyncError(db, data.syncRunId, data.repositoryId, e, outcome.kind === "transient");
      await finishSyncRun(db, data.syncRunId, "failed");
      if (outcome.kind === "permanent") {
        log("warn", "import skipped permanently", { syncRunId: data.syncRunId, reason: outcome.reason });
        return; // do not retry: it can never succeed
      }
      throw e; // pg-boss retries with exponential backoff; checkpoints resume
    }
  });
}
