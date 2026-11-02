import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { schema } from "../src/database/client.js";
import { RateLimitError } from "../src/services/github/index.js";
import { discoverRepositories } from "../src/worker/services/discovery.js";
import { importRepository, startSyncRun } from "../src/worker/services/importer.js";
import { acct, commitOf, FakeGitHub, installation, repo, reset, testDb } from "./helpers.js";

const { db } = testDb();
let gh: FakeGitHub;

beforeEach(async () => {
  await reset(db);
  gh = new FakeGitHub();
  const orgA = acct(100, "org-a", "Organization"), orgB = acct(200, "org-b", "Organization");
  gh.installations.set(1, installation(1, 100, "org-a"));
  gh.installations.set(2, installation(2, 200, "org-b"));
  gh.repos.set(1, [repo(11, "org-a/api", orgA), repo(12, "org-a/web", orgA), repo(13, "org-a/infra", orgA)]);
  gh.repos.set(2, [repo(21, "org-b/tools", orgB)]);
});

describe("multi-installation repository discovery", () => {
  it("keeps installations and their paginated repositories separate", async () => {
    expect(await discoverRepositories(db, gh, 1)).toEqual([11, 12, 13]);
    await discoverRepositories(db, gh, 2);
    const rows = await db.select().from(schema.repository);
    expect(rows.filter((r) => r.installationId === 1)).toHaveLength(3);
    expect(rows.filter((r) => r.installationId === 2).map((r) => r.fullName)).toEqual(["org-b/tools"]);
    expect(await db.select().from(schema.githubInstallation)).toHaveLength(2);
  });

  it("flags repositories that lost access without deleting their history", async () => {
    await discoverRepositories(db, gh, 1);
    gh.repos.set(1, gh.repos.get(1)!.filter((r) => r.id !== 12));
    await discoverRepositories(db, gh, 1);
    const [gone] = await db.select().from(schema.repository).where(eq(schema.repository.id, 12));
    expect(gone!.accessible).toBe(false);
  });
});

describe("historical import", () => {
  async function setup() {
    await discoverRepositories(db, gh, 1);
    gh.branches.set("org-a/api", [{ name: "main", sha: "c5" }, { name: "feature", sha: "c6" }, { name: "old", sha: "c1" }]);
    const main = ["c5", "c4", "c3", "c2", "c1"].map((s, i) => commitOf(s, `2026-10-0${5 - i}T10:00:00Z`, acct(1)));
    gh.commits.set("org-a/api/main", main);
    // feature shares c3..c1 with main and adds c6 (by another dev) + one unresolved-identity commit
    gh.commits.set("org-a/api/feature", [commitOf("c6", "2026-10-06T10:00:00Z", acct(2)), commitOf("cx", "2026-10-06T09:00:00Z", null), ...main.slice(2)]);
    gh.commits.set("org-a/api/old", main.slice(4));
  }

  it("paginates, enumerates branches and counts each commit once", async () => {
    await setup();
    const run = await startSyncRun(db, "import", 1, 11, null);
    const r = await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    const commits = await db.select().from(schema.commit).where(eq(schema.commit.repositoryId, 11));
    expect(commits.map((c) => c.sha).sort()).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "cx"]);
    expect(r.branches).toBe(3);
    expect(gh.calls.filter((c) => c.startsWith("org-a/api@main"))).toHaveLength(3); // 5 commits / 2 per page
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int n from commit_branch`);
    const n = rows[0]?.n ?? 0;
    expect(n).toBeGreaterThan(commits.length); // shared commits belong to several branches
  });

  it("is idempotent when the same import runs again", async () => {
    await setup();
    for (let i = 0; i < 2; i++) {
      const run = await startSyncRun(db, "import", 1, 11, null);
      await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    }
    expect(await db.select().from(schema.commit)).toHaveLength(7);
  });

  it("leaves unresolved identities unassigned instead of guessing", async () => {
    await setup();
    const run = await startSyncRun(db, "import", 1, 11, null);
    await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    const [cx] = await db.select().from(schema.commit).where(eq(schema.commit.sha, "cx"));
    expect(cx!.authorAccountId).toBeNull();
    expect(cx!.authorName).toBe("Anon");
    expect(await db.select().from(schema.developerAccount)).toHaveLength(2);
  });

  it("respects the since window", async () => {
    await setup();
    const run = await startSyncRun(db, "import", 1, 11, new Date("2026-10-04T00:00:00Z"));
    await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: new Date("2026-10-04T00:00:00Z"), syncRunId: run });
    const shas = (await db.select().from(schema.commit)).map((c) => c.sha).sort();
    expect(shas).toEqual(["c4", "c5", "c6", "cx"]);
  });

  it("resumes from its checkpoint after a rate limit", async () => {
    await setup();
    const run = await startSyncRun(db, "import", 1, 11, null);
    gh.failCommitsOnceAtPage = 2;
    await expect(importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run })).rejects.toBeInstanceOf(RateLimitError);
    const [cp] = await db.select().from(schema.syncCheckpoint).where(eq(schema.syncCheckpoint.syncRunId, run));
    expect(cp!.nextPage).toBe(2);
    gh.calls.length = 0;
    await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    expect(gh.calls.find((c) => c === "org-a/api@main#1")).toBeUndefined(); // page 1 not refetched
    expect(await db.select().from(schema.commit)).toHaveLength(7);
  });

  it("marks branches that vanished as deleted but keeps their commits", async () => {
    await setup();
    let run = await startSyncRun(db, "import", 1, 11, null);
    await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    gh.branches.set("org-a/api", [{ name: "main", sha: "c5" }]);
    run = await startSyncRun(db, "import", 1, 11, null);
    await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    const b = await db.select().from(schema.branch).where(eq(schema.branch.name, "feature"));
    expect(b[0]!.deleted).toBe(true);
    expect(await db.select().from(schema.commit)).toHaveLength(7);
  });
});

describe("hostile commit data", () => {
  it("stores commits whose message contains NUL bytes instead of failing the import", async () => {
    await discoverRepositories(db, gh, 1);
    gh.branches.set("org-a/api", [{ name: "main", sha: "n1" }]);
    gh.commits.set("org-a/api/main", [{ ...commitOf("n1", "2026-10-05T10:00:00Z", acct(1)), message: "fix\u0000 bug", authorName: "Dev\u0000X" }]);
    const run = await startSyncRun(db, "import", 1, 11, null);
    await importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run });
    const [c] = await db.select().from(schema.commit).where(eq(schema.commit.sha, "n1"));
    expect(c?.message).toBe("fix bug");
    expect(c?.authorName).toBe("DevX");
  });
});
