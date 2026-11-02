import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "../../database/client.js";
import type { GhAccount, GitHubApi } from "../../services/github/index.js";
import { vInstallationPayloadSchema, vInstallationReposPayloadSchema, vPushPayloadSchema, vRepositoryPayloadSchema, type PushPayload } from "../../validations/schemas/github/github-payload-schemas.js";
import { discoverRepositories, setInstallationStatus, markReposInaccessible } from "./discovery.js";
import { ensureBranch, ingestCommits, markBranchDeleted, upsertDeveloper } from "./ingest.js";

const { webhookDelivery, repository, commit, commitBranch } = schema;

export type Outcome = "processed" | "ignored";

/**
 * Process one persisted delivery. Safe to retry: every write is an upsert, and
 * commit ingestion is unique on (repository_id, sha).
 */
export async function processWebhookDelivery(db: Db, gh: GitHubApi, deliveryRowId: number): Promise<Outcome> {
  const [d] = await db.select().from(webhookDelivery).where(eq(webhookDelivery.id, deliveryRowId));
  if (!d) throw new Error(`delivery ${deliveryRowId} not found`);
  if (d.status === "processed" || d.status === "ignored") return d.status;

  await db.update(webhookDelivery).set({ status: "processing", attempts: d.attempts + 1 }).where(eq(webhookDelivery.id, d.id));
  try {
    const outcome = await dispatch(db, gh, d.event, d.action, d.payload, d.receivedAt);
    await db.update(webhookDelivery).set({ status: outcome, processedAt: new Date(), error: null }).where(eq(webhookDelivery.id, d.id));
    return outcome;
  } catch (e) {
    await db.update(webhookDelivery).set({ status: "failed", error: String((e as Error).message).slice(0, 2000) }).where(eq(webhookDelivery.id, d.id));
    throw e; // let the queue retry with backoff
  }
}

async function dispatch(db: Db, gh: GitHubApi, event: string, action: string | null, raw: unknown, receivedAt: Date): Promise<Outcome> {
  switch (event) {
    case "installation": {
      const { installation } = vInstallationPayloadSchema.parse(raw);
      if (action === "deleted") { await setInstallationStatus(db, installation.id, "deleted"); return "processed"; }
      if (action === "suspend") { await setInstallationStatus(db, installation.id, "suspended"); return "processed"; }
      await discoverRepositories(db, gh, installation.id); // created, unsuspend, new_permissions_accepted
      return "processed";
    }
    case "installation_repositories": {
      const p = vInstallationReposPayloadSchema.parse(raw);
      await discoverRepositories(db, gh, p.installation.id);
      if (action === "removed") await markReposInaccessible(db, p.repositories_removed.map((r) => r.id));
      return "processed";
    }
    case "repository": {
      const p = vRepositoryPayloadSchema.parse(raw);
      if (!p.installation) return "ignored";
      if (action === "deleted") { await markReposInaccessible(db, [p.repository.id]); return "processed"; }
      await discoverRepositories(db, gh, p.installation.id);
      return "processed";
    }
    case "push": return handlePush(db, gh, vPushPayloadSchema.parse(raw), receivedAt);
    default: return "ignored"; // ping and events we do not subscribe to
  }
}

async function handlePush(db: Db, gh: GitHubApi, p: PushPayload, receivedAt: Date): Promise<Outcome> {
  const installationId = p.installation?.id;
  if (!installationId) return "ignored";
  if (!p.ref.startsWith("refs/heads/")) return "ignored"; // tags etc.
  const branchName = p.ref.slice("refs/heads/".length);
  const repoId = p.repository.id;

  let [repo] = await db.select().from(repository).where(eq(repository.id, repoId));
  if (!repo) { // push for a repo we haven't discovered yet
    await discoverRepositories(db, gh, installationId);
    [repo] = await db.select().from(repository).where(eq(repository.id, repoId));
    if (!repo) return "ignored";
  }
  if (!repo.monitored) return "ignored";
  if (p.deleted) { await markBranchDeleted(db, repoId, branchName); return "processed"; }

  const branchId = await ensureBranch(db, repoId, branchName, p.after ?? null, branchName === repo.defaultBranch);

  const sender = p.sender ? {
    id: p.sender.id, login: p.sender.login, type: toAccountType(p.sender.type),
    avatarUrl: p.sender.avatar_url ?? null, htmlUrl: p.sender.html_url ?? null,
  } : null;
  if (sender) await upsertDeveloper(db, sender);

  const shas = p.commits.map((c) => c.id);
  const stamps = p.commits.map((c) => Date.parse(c.timestamp)).filter((n) => Number.isFinite(n));
  if (stamps.length === 0) return "processed";

  // Every pushed commit already stored with a resolved author? Then there is nothing new to ask GitHub for.
  const stored = await db.select({ sha: commit.sha, author: commit.authorAccountId }).from(commit)
    .where(and(eq(commit.repositoryId, repoId), inArray(commit.sha, shas)));
  const complete = stored.length === new Set(shas).size && stored.every((c) => c.author !== null);
  const pushedShas = new Set(shas);

  if (complete) {
    const stored2 = await db.select({ id: commit.id }).from(commit).where(and(eq(commit.repositoryId, repoId), inArray(commit.sha, shas)));
    await db.insert(commitBranch).values(stored2.map((c) => ({ commitId: c.id, branchId }))).onConflictDoNothing();
    return "processed";
  }

  // Payload commits lack GitHub user ids and are capped at 20, so read the pushed range from the API once.
  const since = new Date(Math.min(...stamps) - 1000);
  for (let page = 1; ; page++) {
    const res = await gh.listCommits(installationId, repo.fullName, branchName, since, page);
    await ingestCommits(db, {
      repositoryId: repoId, branchId, commits: res.items, source: "webhook",
      pushedAt: receivedAt, pusherId: sender?.id ?? null, pushedShas,
    });
    if (!res.hasNext) break;
  }
  return "processed";
}

function toAccountType(t: string | undefined): GhAccount["type"] {
  return t === "Organization" || t === "Bot" || t === "Mannequin" ? t : "User";
}
