import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { schema } from "../src/database/client.js";
import { seedAnalytics, seedSecondOrganization } from "./fixtures.js";
import { reset, testAuth, testDb } from "./helpers.js";

const { db } = testDb();
const app = createApp({ db, webhookSecret: "x".repeat(24), queue: { send: async () => "id" }, auth: testAuth });
const RANGE = "range=custom&from=2026-10-05&to=2026-10-06";

type Role = "DEVELOPER" | "ADMIN" | "SUPER_ADMIN";
type Session = { cookie: string; csrf: string };

async function signIn(role: Role): Promise<Session> {
  const res = await app.request("/api/v1/auth/dev-login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${role.toLowerCase()}@example.test`, role }),
  });
  return { cookie: (res.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "", csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
}

async function call<T>(s: Session, method: string, path: string, body?: unknown, withCsrf = true): Promise<{ status: number; body: T }> {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: { cookie: s.cookie, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(withCsrf ? { "x-csrf-token": s.csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as T };
}

type Team = { id: number; name: string; slug: string; memberCount: number };
type Totals = { totals: { commits: number; activeDevelopers: number } };
type Breakdown = { by: string; groups: { id: number | null; label: string | null; commits: number; developers: number; repositories: number }[] };

let admin: Session;
let dev: Session;

beforeEach(async () => {
  await reset(db);
  await seedAnalytics(db);
  admin = await signIn("ADMIN");
  dev = await signIn("DEVELOPER");
});

describe("team management permissions", () => {
  it("lets every signed-in role read teams but only admins change them", async () => {
    expect((await call(dev, "GET", "/teams")).status).toBe(200);
    expect((await call(dev, "POST", "/teams", { name: "Backend" })).status).toBe(403);
    expect((await call<Team>(admin, "POST", "/teams", { name: "Backend" })).status).toBe(201);
    expect((await call(await signIn("SUPER_ADMIN"), "POST", "/teams", { name: "Mobile" })).status).toBe(201);
  });

  it("requires the CSRF token on changes", async () => {
    expect((await call(admin, "POST", "/teams", { name: "Backend" }, false)).status).toBe(403);
  });

  it("rejects duplicate names (even differently cased) and invalid input", async () => {
    await call(admin, "POST", "/teams", { name: "Backend Team" });
    expect((await call(admin, "POST", "/teams", { name: "backend   team" })).status).toBe(409);
    expect((await call(admin, "POST", "/teams", { name: "x" })).status).toBe(400);
    expect((await call(admin, "POST", "/teams", { name: "Ok name", color: "red" })).status).toBe(400);
    expect((await call(admin, "POST", "/teams", { name: "!!!" })).status).toBe(400);
  });

  it("updates, sets members atomically, and deletes with cascade", async () => {
    const created = (await call<Team>(admin, "POST", "/teams", { name: "Backend", color: "#3b82f6" })).body;
    expect((await call<Team>(admin, "PATCH", `/teams/${created.id}`, { name: "Platform" })).body).toMatchObject({ name: "Platform", slug: "platform" });
    expect((await call(admin, "PATCH", `/teams/${created.id}`, {})).status).toBe(400);

    const set = await call<{ members: { login: string }[] }>(admin, "PUT", `/teams/${created.id}/members`, { developerAccountIds: [1, 2] });
    expect(set.body.members.map((m) => m.login)).toEqual(["alice", "bob"]);
    expect((await call<Team>(admin, "GET", `/teams/${created.id}`)).body.memberCount).toBe(2);

    expect((await call(admin, "PUT", `/teams/${created.id}/members`, { developerAccountIds: [1, 999] })).status).toBe(400);
    expect((await call(admin, "PUT", `/teams/${created.id}/members`, { developerAccountIds: [1, 1] })).status).toBe(400);
    expect((await call<Team>(admin, "GET", `/teams/${created.id}`)).body.memberCount).toBe(2); // failed updates left it untouched

    expect((await call(admin, "DELETE", `/teams/${created.id}`)).status).toBe(200);
    expect(await db.select().from(schema.teamMember)).toHaveLength(0);
    expect((await call(admin, "GET", `/teams/${created.id}`)).status).toBe(404);
  });

  it("writes an audit log entry for every change", async () => {
    const created = (await call<Team>(admin, "POST", "/teams", { name: "Backend" })).body;
    await call(admin, "PUT", `/teams/${created.id}/members`, { developerAccountIds: [1] });
    await call(admin, "DELETE", `/teams/${created.id}`);
    const rows = await db.select().from(schema.auditLog).orderBy(schema.auditLog.id);
    expect(rows.map((r) => r.action)).toEqual(["team.create", "team.members.set", "team.delete"]);
    expect(rows.every((r) => r.actorUserId !== null && r.targetId === String(created.id))).toBe(true);
  });
});

describe("team filter and breakdown", () => {
  async function makeTeam(name: string, accountIds: number[]): Promise<number> {
    const t = (await call<Team>(admin, "POST", "/teams", { name })).body;
    await call(admin, "PUT", `/teams/${t.id}/members`, { developerAccountIds: accountIds });
    return t.id;
  }

  it("filters every analytic to a team's members", async () => {
    const id = await makeTeam("Backend", [1]); // alice only
    const all = (await call<Totals>(dev, "GET", `/analytics/overview?${RANGE}`)).body.totals;
    const only = (await call<Totals>(dev, "GET", `/analytics/overview?${RANGE}&teamId=${id}`)).body.totals;
    expect(all.commits).toBe(6);
    expect(only).toMatchObject({ commits: 3, activeDevelopers: 1 });
  });

  it("an empty team yields zeros rather than everything", async () => {
    const id = await makeTeam("Empty", []);
    expect((await call<Totals>(dev, "GET", `/analytics/overview?${RANGE}&teamId=${id}`)).body.totals.commits).toBe(0);
  });

  it("groups by team; a person in two teams counts in both, commits by non-members are excluded", async () => {
    await makeTeam("Backend", [1, 2]);
    await makeTeam("Reviewers", [1]);
    const { body } = await call<Breakdown>(dev, "GET", `/analytics/breakdown?${RANGE}&by=team`);
    expect(body.groups.map((g) => [g.label, g.commits, g.developers])).toEqual([["Backend", 5, 2], ["Reviewers", 3, 1]]);
  });

  it("groups by organization across several GitHub installations", async () => {
    await seedSecondOrganization(db);
    const { body } = await call<Breakdown>(dev, "GET", `/analytics/breakdown?${RANGE}&by=organization`);
    expect(body.groups.map((g) => [g.label, g.commits, g.repositories])).toEqual([["org-a", 6, 2], ["org-b", 2, 1]]);
    const overview = (await call<Totals>(dev, "GET", `/analytics/overview?${RANGE}`)).body.totals;
    expect(overview.commits).toBe(8);
    const orgB = (await call<Totals>(dev, "GET", `/analytics/overview?${RANGE}&installationId=2`)).body.totals;
    expect(orgB.commits).toBe(2);
  });

  it("groups by repository and by developer, keeping Unassigned as its own null group", async () => {
    const repos = (await call<Breakdown>(dev, "GET", `/analytics/breakdown?${RANGE}&by=repository`)).body.groups;
    expect(repos.map((g) => [g.label, g.commits])).toEqual([["org-a/api", 5], ["org-a/web", 1]]);
    const people = (await call<Breakdown>(dev, "GET", `/analytics/breakdown?${RANGE}&by=developer`)).body.groups;
    expect(people.map((g) => [g.label, g.commits])).toEqual([["alice", 3], ["bob", 2], [null, 1]]);
  });

  it("rejects unknown dimensions and respects the limit", async () => {
    expect((await call(dev, "GET", `/analytics/breakdown?${RANGE}&by=salary`)).status).toBe(400);
    expect((await call<Breakdown>(dev, "GET", `/analytics/breakdown?${RANGE}&by=developer&limit=1`)).body.groups).toHaveLength(1);
  });

  it("deleting a developer account removes it from teams without touching other members", async () => {
    const id = await makeTeam("Backend", [1, 2]);
    await db.delete(schema.teamMember).where(eq(schema.teamMember.developerAccountId, 2));
    expect((await call<Team>(dev, "GET", `/teams/${id}`)).body.memberCount).toBe(1);
  });
});
