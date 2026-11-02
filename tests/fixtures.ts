import { discoverRepositories } from "../src/worker/services/discovery.js";
import { importRepository, startSyncRun } from "../src/worker/services/importer.js";
import type { Db } from "../src/database/client.js";
import { acct, commitOf, FakeGitHub, installation, repo } from "./helpers.js";

export const alice = acct(1, "alice");
export const bob = acct(2, "bob");
export const bot = acct(3, "dependabot[bot]", "Bot");

export async function seedAnalytics(db: Db): Promise<void> {
  const gh = new FakeGitHub();
  gh.perPage = 50;
  const org = acct(100, "org-a", "Organization");
  gh.installations.set(1, installation(1, 100, "org-a"));
  gh.repos.set(1, [repo(11, "org-a/api", org), repo(12, "org-a/web", org)]);
  await discoverRepositories(db, gh, 1);
  gh.branches.set("org-a/api", [{ name: "main", sha: "m1" }]);
  gh.branches.set("org-a/web", [{ name: "main", sha: "r1" }]);
  gh.commits.set("org-a/api/main", [
    commitOf("m1", "2026-10-06T08:00:00Z", alice, 2), // merge, 13:30 IST
    commitOf("u1", "2026-10-06T07:00:00Z", null),     // unassigned, 12:30 IST
    commitOf("d1", "2026-10-06T06:00:00Z", bot),      // bot
    commitOf("b1", "2026-10-06T05:00:00Z", bob),      // 10:30 IST
    commitOf("a2", "2026-10-05T18:30:00Z", alice),    // 00:00:00 IST on Oct 6
    commitOf("a1", "2026-10-05T18:29:59Z", alice),    // 23:59:59 IST on Oct 5
  ]);
  gh.commits.set("org-a/web/main", [commitOf("r1", "2026-10-06T09:00:00Z", bob)]);
  for (const repositoryId of [11, 12]) {
    const run = await startSyncRun(db, "import", 1, repositoryId, null);
    await importRepository(db, gh, { installationId: 1, repositoryId, since: null, syncRunId: run });
  }
}


/** A second GitHub organization with its own installation, to prove grouping works across organizations. */
export async function seedSecondOrganization(db: Db): Promise<void> {
  const gh = new FakeGitHub();
  gh.perPage = 50;
  const org = acct(200, "org-b", "Organization");
  gh.installations.set(2, installation(2, 200, "org-b"));
  gh.repos.set(2, [repo(21, "org-b/tools", org)]);
  await discoverRepositories(db, gh, 2);
  gh.branches.set("org-b/tools", [{ name: "main", sha: "t2" }]);
  gh.commits.set("org-b/tools/main", [
    commitOf("t2", "2026-10-06T10:00:00Z", acct(4, "carol")),
    commitOf("t1", "2026-10-06T09:30:00Z", alice),
  ]);
  const run = await startSyncRun(db, "import", 2, 21, null);
  await importRepository(db, gh, { installationId: 2, repositoryId: 21, since: null, syncRunId: run });
}
