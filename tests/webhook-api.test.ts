import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "../src/database/client.js";
import type { SendOptions } from "../src/types/app.types.js";
import { createApp } from "../src/app.js";
import { discoverRepositories } from "../src/worker/services/discovery.js";
import { processWebhookDelivery } from "../src/worker/services/webhooks.js";
import { acct, commitOf, FakeGitHub, installation, repo, reset, testDb } from "./helpers.js";

const secret = "webhook-secret-1234567890";
const { db } = testDb();
const sent: { name: string; data: object; options?: SendOptions | undefined }[] = [];
const app = createApp({ db, webhookSecret: secret, queue: { send: async (name, data, options) => { sent.push({ name, data, options }); return "id"; } } });

const sign = (b: string) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");
function post(body: object | string, headers: Record<string, string> = {}, sig?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return app.request("/api/v1/webhooks/github", {
    method: "POST", body: raw,
    headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "d-1", "x-hub-signature-256": sig ?? sign(raw), ...headers },
  });
}

let gh: FakeGitHub;
beforeEach(async () => {
  await reset(db); sent.length = 0;
  gh = new FakeGitHub();
  const org = acct(100, "org-a", "Organization");
  gh.installations.set(1, installation(1, 100, "org-a"));
  gh.repos.set(1, [repo(11, "org-a/api", org)]);
  await discoverRepositories(db, gh, 1);
});

describe("POST /api/v1/webhooks/github", () => {
  const push = { ref: "refs/heads/main", after: "c2", installation: { id: 1 }, repository: { id: 11 }, sender: { id: 7, login: "pusher", type: "User" },
    commits: [{ id: "c1", timestamp: "2026-10-05T10:00:00Z" }, { id: "c2", timestamp: "2026-10-05T11:00:00Z" }] };

  it("rejects bad signatures and persists nothing", async () => {
    const res = await post(push, {}, "sha256=" + "0".repeat(64));
    expect(res.status).toBe(401);
    expect(await db.select().from(schema.webhookDelivery)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("rejects a body that differs from what was signed", async () => {
    const res = await post(JSON.stringify(push) + " ", {}, sign(JSON.stringify(push)));
    expect(res.status).toBe(401);
  });

  it("persists, acknowledges with 202 and enqueues a retrying job", async () => {
    const res = await post(push);
    expect(res.status).toBe(202);
    expect(await db.select().from(schema.webhookDelivery)).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.options?.retryLimit).toBeGreaterThan(0);
    expect(sent[0]!.options?.retryBackoff).toBe(true);
  });

  it("treats a GitHub re-delivery of the same GUID as one delivery", async () => {
    await post(push); await post(push);
    expect(await db.select().from(schema.webhookDelivery)).toHaveLength(1);
  });

  it("does not re-enqueue a delivery that already processed", async () => {
    await post(push);
    await db.update(schema.webhookDelivery).set({ status: "processed" });
    sent.length = 0;
    await post(push);
    expect(sent).toHaveLength(0);
  });
});

describe("push processing", () => {
  it("ingests pushed commits with pusher attribution, then survives a retry", async () => {
    gh.commits.set("org-a/api/main", [commitOf("c2", "2026-10-05T11:00:00Z", acct(1)), commitOf("c1", "2026-10-05T10:00:00Z", acct(2))]);
    const body = { ref: "refs/heads/main", after: "c2", installation: { id: 1 }, repository: { id: 11 }, sender: { id: 7, login: "pusher", type: "User" },
      commits: [{ id: "c1", timestamp: "2026-10-05T10:00:00Z" }, { id: "c2", timestamp: "2026-10-05T11:00:00Z" }] };
    await post(body);
    const [d] = await db.select().from(schema.webhookDelivery);
    await processWebhookDelivery(db, gh, d!.id);
    let commits = await db.select().from(schema.commit);
    expect(commits).toHaveLength(2);
    expect(commits.every((c) => c.pusherAccountId === 7 && c.source === "webhook" && c.pushedAt)).toBe(true);
    // author and pusher are different people and both preserved
    expect(commits.find((c) => c.sha === "c1")!.authorAccountId).toBe(2);

    await db.update(schema.webhookDelivery).set({ status: "failed" }).where(eq(schema.webhookDelivery.id, d!.id));
    await processWebhookDelivery(db, gh, d!.id); // retry
    commits = await db.select().from(schema.commit);
    expect(commits).toHaveLength(2);
  });

  it("marks failures so the queue retries, then succeeds", async () => {
    const body = { ref: "refs/heads/main", after: "c1", installation: { id: 1 }, repository: { id: 11 }, sender: { id: 7, login: "p", type: "User" }, commits: [{ id: "c1", timestamp: "2026-10-05T10:00:00Z" }] };
    await post(body);
    const [d] = await db.select().from(schema.webhookDelivery);
    const orig = gh.listCommits.bind(gh); let boom = true;
    gh.listCommits = async (...a) => { if (boom) { boom = false; throw new Error("github 502"); } return orig(...a); };
    gh.commits.set("org-a/api/main", [commitOf("c1", "2026-10-05T10:00:00Z")]);
    await expect(processWebhookDelivery(db, gh, d!.id)).rejects.toThrow("502");
    expect((await db.select().from(schema.webhookDelivery))[0]!.status).toBe("failed");
    await processWebhookDelivery(db, gh, d!.id);
    expect((await db.select().from(schema.webhookDelivery))[0]!.status).toBe("processed");
    expect(await db.select().from(schema.commit)).toHaveLength(1);
  });

  it("handles installation removal and ignores tag pushes", async () => {
    await post({ action: "deleted", installation: { id: 1 } }, { "x-github-event": "installation", "x-github-delivery": "d-i" });
    await post({ ref: "refs/tags/v1", installation: { id: 1 }, repository: { id: 11 } }, { "x-github-delivery": "d-t" });
    for (const d of await db.select().from(schema.webhookDelivery)) await processWebhookDelivery(db, gh, d.id);
    expect((await db.select().from(schema.githubInstallation))[0]!.status).toBe("deleted");
    expect(await db.select().from(schema.commit)).toHaveLength(0);
  });
});
