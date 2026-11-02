import { createHmac, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "../src/database/client.js";
import { createGitHubClient, RateLimitError } from "../src/services/github/index.js";
import { createApp } from "../src/app.js";
import { discoverRepositories } from "../src/worker/services/discovery.js";
import { importRepository, startSyncRun, RATE_LIMIT_FLOOR } from "../src/worker/services/importer.js";
import { processWebhookDelivery } from "../src/worker/services/webhooks.js";
import { acct, commitOf, FakeGitHub, installation, repo, reset, testAuth, testDb } from "./helpers.js";

const { db } = testDb();
let gh: FakeGitHub;

async function runImport(since: Date | null) {
  const run = await startSyncRun(db, "import", 1, 11, since);
  return importRepository(db, gh, { installationId: 1, repositoryId: 11, since, syncRunId: run });
}

beforeEach(async () => {
  await reset(db);
  gh = new FakeGitHub();
  gh.installations.set(1, installation(1, 100, "org-a"));
  gh.repos.set(1, [repo(11, "org-a/api", acct(100, "org-a", "Organization"))]);
  await discoverRepositories(db, gh, 1);
  gh.branches.set("org-a/api", [{ name: "main", sha: "c5" }, { name: "feature", sha: "c6" }]);
  const main = ["c5", "c4", "c3", "c2", "c1"].map((s, i) => commitOf(s, `2026-10-0${5 - i}T10:00:00Z`));
  gh.commits.set("org-a/api/main", main);
  gh.commits.set("org-a/api/feature", [commitOf("c6", "2026-10-06T10:00:00Z", acct(2)), ...main.slice(2)]);
});

describe("no repeated fetching", () => {
  it("does not touch GitHub for branches whose head has not moved", async () => {
    await runImport(null);
    gh.calls.length = 0;
    const r = await runImport(null);
    expect(gh.calls).toEqual([]);
    expect(r.skippedBranches).toBe(2);
  });

  it("fetches only new commits after a branch advances", async () => {
    await runImport(null);
    gh.calls.length = 0;
    gh.branches.set("org-a/api", [{ name: "main", sha: "c7" }, { name: "feature", sha: "c6" }]);
    gh.commits.set("org-a/api/main", [commitOf("c7", new Date().toISOString()), ...(gh.commits.get("org-a/api/main") ?? [])]);
    const r = await runImport(null);
    expect(gh.calls).toEqual(["org-a/api@main#1"]); // one page, only the moved branch, not the whole history
    expect(r.inserted).toBe(1);
  });

  it("a wider window than previously imported is not wrongly skipped", async () => {
    await runImport(new Date("2026-10-04T00:00:00Z"));
    gh.calls.length = 0;
    await runImport(null); // asked for full history now
    expect(gh.calls.length).toBeGreaterThan(0);
    expect(await db.select().from(schema.commit)).toHaveLength(6);
  });

  it("stops paging a side branch once it reaches history already stored", async () => {
    await runImport(null);
    const feature = gh.calls.filter((c) => c.startsWith("org-a/api@feature"));
    expect(feature).toEqual(["org-a/api@feature#1", "org-a/api@feature#2"]); // 4 commits at 2/page, but page 2 is all known
  });

  it("parks the job before the rate limit floor is crossed, keeping its checkpoint", async () => {
    const orig = gh.listCommits.bind(gh);
    gh.listCommits = async (...a) => ({ ...(await orig(...a)), rateLimit: { remaining: RATE_LIMIT_FLOOR - 1, resetAt: new Date(Date.now() + 60_000) } });
    const run = await startSyncRun(db, "import", 1, 11, null);
    await expect(importRepository(db, gh, { installationId: 1, repositoryId: 11, since: null, syncRunId: run })).rejects.toBeInstanceOf(RateLimitError);
    const [cp] = await db.select().from(schema.syncCheckpoint).where(eq(schema.syncCheckpoint.syncRunId, run));
    expect(cp?.nextPage).toBe(2); // page 1 persisted before parking
  });
});

describe("ETag conditional requests", () => {
  it("re-sends If-None-Match and serves the cached page on 304", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    let listCalls = 0; const conditional: (string | null)[] = [];
    const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const headers = new Headers(init.headers);
      if (url.pathname.endsWith("/access_tokens")) return new Response(JSON.stringify({ token: "t", expires_at: new Date(Date.now() + 3_600_000).toISOString() }), { status: 201, headers: { "content-type": "application/json" } });
      listCalls++; conditional.push(headers.get("if-none-match"));
      if (headers.get("if-none-match") === '"v1"') return new Response(null, { status: 304, headers: { etag: '"v1"' } });
      return new Response(JSON.stringify([{ name: "main", commit: { sha: "abc" } }]), { status: 200, headers: { "content-type": "application/json", etag: '"v1"' } });
    }) as typeof fetch;
    const client = createGitHubClient({ appId: "1", privateKey, baseUrl: "https://api.test", fetch: fetchFn });
    const a = await client.listBranches(5, "o/r", 1);
    const b = await client.listBranches(5, "o/r", 1);
    expect(conditional).toEqual([null, '"v1"']);
    expect(b.items).toEqual(a.items);
    expect(listCalls).toBe(2);
  });
});

describe("webhook push avoids redundant API calls", () => {
  const secret = "webhook-secret-1234567890";
  const app = createApp({ db, webhookSecret: secret, auth: testAuth, queue: { send: async () => "id" } });
  const body = { ref: "refs/heads/main", after: "c1", installation: { id: 1 }, repository: { id: 11 }, sender: { id: 7, login: "p", type: "User" }, commits: [{ id: "c1", timestamp: "2026-10-05T10:00:00Z" }] };
  async function deliver(id: string) {
    const raw = JSON.stringify(body);
    await app.request("/api/v1/webhooks/github", { method: "POST", body: raw, headers: { "x-github-event": "push", "x-github-delivery": id, "x-hub-signature-256": "sha256=" + createHmac("sha256", secret).update(raw).digest("hex") } });
    const rows = await db.select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.deliveryId, id));
    const row = rows[0];
    if (!row) throw new Error("delivery missing");
    await processWebhookDelivery(db, gh, row.id);
  }

  it("asks GitHub once, then skips when the pushed commits are already stored", async () => {
    gh.commits.set("org-a/api/main", [commitOf("c1", "2026-10-05T10:00:00Z")]);
    await deliver("d1");
    const first = gh.calls.length;
    expect(first).toBe(1);
    await deliver("d2"); // e.g. reconciliation or a second push event naming the same commit
    expect(gh.calls.length).toBe(first);
    expect(await db.select().from(schema.commit)).toHaveLength(1);
  });
});
