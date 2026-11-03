import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../database/client.js";
import { repository, syncRun } from "../../database/schema/index.js";

type SyncRunFilter = {
  installationId?: number | undefined;
  kind?: "discovery" | "import" | "reconcile" | undefined;
  status?: "pending" | "running" | "succeeded" | "failed" | "partial" | "cancelled" | undefined;
};

function buildSyncWhere(filter: SyncRunFilter) {
  return and(
    filter.installationId !== undefined ? eq(syncRun.installationId, filter.installationId) : undefined,
    filter.kind !== undefined ? eq(syncRun.kind, filter.kind) : undefined,
    filter.status !== undefined ? eq(syncRun.status, filter.status) : undefined,
  );
}

export type SyncRunRow = {
  id: number;
  kind: string;
  status: string;
  installationId: number;
  repositoryId: number | null;
  repoFullName: string | null;
  commitsSeen: number;
  commitsInserted: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  sinceDate: Date | null;
};

export async function listSyncRuns(
  db: Db,
  filter: SyncRunFilter,
  page: number,
  pageSize: number,
): Promise<SyncRunRow[]> {
  const offset = (page - 1) * pageSize;
  const rows = await db
    .select({
      id: syncRun.id,
      kind: syncRun.kind,
      status: syncRun.status,
      installationId: syncRun.installationId,
      repositoryId: syncRun.repositoryId,
      repoFullName: repository.fullName,
      commitsSeen: syncRun.commitsSeen,
      commitsInserted: syncRun.commitsInserted,
      startedAt: syncRun.startedAt,
      finishedAt: syncRun.finishedAt,
      sinceDate: syncRun.sinceDate,
    })
    .from(syncRun)
    .leftJoin(repository, eq(syncRun.repositoryId, repository.id))
    .where(buildSyncWhere(filter))
    .orderBy(desc(syncRun.createdAt))
    .limit(pageSize)
    .offset(offset);

  return rows;
}

export async function countSyncRuns(db: Db, filter: SyncRunFilter): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(syncRun)
    .where(buildSyncWhere(filter));

  return rows[0]?.count ?? 0;
}
