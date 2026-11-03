import { JOBS } from "../constants/jobs.js";
import { countSyncRuns, listSyncRuns } from "../services/database/sync-db-service.js";
import type { AppHandler } from "../factory.js";
import type { z } from "zod";
import type { vSyncRunsQuery, vTriggerSync } from "../validations/schemas/sync/sync-schemas.js";

export const handleListSyncRuns: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vSyncRunsQuery>;
  const { db } = c.var.deps;

  const filter = {
    ...(q.installationId !== undefined ? { installationId: q.installationId } : {}),
    ...(q.kind !== undefined ? { kind: q.kind } : {}),
    ...(q.status !== undefined ? { status: q.status } : {}),
  };

  const [runs, total] = await Promise.all([
    listSyncRuns(db, filter, q.page, q.pageSize),
    countSyncRuns(db, filter),
  ]);

  return c.json({
    runs: runs.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      installationId: r.installationId,
      repositoryId: r.repositoryId,
      repoFullName: r.repoFullName,
      commitsSeen: r.commitsSeen,
      commitsInserted: r.commitsInserted,
      startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : null,
      finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : null,
      durationMs:
        r.startedAt instanceof Date && r.finishedAt instanceof Date
          ? r.finishedAt.getTime() - r.startedAt.getTime()
          : null,
      sinceDate: r.sinceDate instanceof Date ? r.sinceDate.toISOString() : null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  }, 200);
};

export const handleTriggerSync: AppHandler = async (c) => {
  const { installationId } = c.get("validated") as z.infer<typeof vTriggerSync>;
  const { queue } = c.var.deps;

  await queue.send(JOBS.DISCOVER, { installationId });

  return c.json({ queued: true, installationId }, 202);
};
