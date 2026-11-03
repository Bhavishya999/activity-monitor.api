import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "../src/database/client.js";
import { createApp } from "../src/app.js";
import { reset, testAuth, testDb } from "./helpers.js";
import { seedAnalytics } from "./fixtures.js";

const { db } = testDb();
const app = createApp({ db, webhookSecret: "x".repeat(24), queue: { send: async () => "id" }, auth: testAuth });

async function signIn(role: "DEVELOPER" | "ADMIN" | "SUPER_ADMIN" = "DEVELOPER"): Promise<{ cookie: string; csrf: string }> {
  const res = await app.request("/api/v1/auth/dev-login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${role.toLowerCase()}@example.test`, role }),
  });
  const cookie = (res.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
  const body = (await res.json()) as { csrfToken: string };
  return { cookie, csrf: body.csrfToken };
}

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const { cookie } = await signIn();
  const res = await app.request(`/api/v1${path}`, { headers: { cookie } });
  return { status: res.status, body: (await res.json()) as T };
}

type Overview = {
  totals: { commits: number; activeDevelopers: number; unassignedCommits: number; mergeCommits: number; activeRepositories: number; connectedRepositories: number };
  dailyTrend: { day: string; commits: number }[];
  hourlyActivity: { hour: number; commits: number }[];
  leaderboard: { developer: { login: string } | null; commits: number }[];
  repositoryDistribution: { name: string; commits: number }[];
  recentCommits: { sha: string }[];
};

const RANGE = "range=custom&from=2026-10-05&to=2026-10-06";

beforeEach(async () => { await reset(db); await seedAnalytics(db); });

describe("overview", () => {
  it("buckets days in the report timezone: 23:59:59 IST and 00:00:00 IST land on different days", async () => {
    const { body } = await get<Overview>(`/analytics/overview?${RANGE}`);
    expect(body.dailyTrend).toEqual([{ day: "2026-10-05", commits: 1 }, { day: "2026-10-06", commits: 5 }]);
  });

  it("the same data buckets differently in UTC", async () => {
    const { body } = await get<Overview>(`/analytics/overview?${RANGE}&timezone=UTC`);
    expect(body.dailyTrend).toEqual([{ day: "2026-10-05", commits: 2 }, { day: "2026-10-06", commits: 4 }]);
  });

  it("reports totals, excluding bots by default and keeping the unassigned bucket visible", async () => {
    const { body } = await get<Overview>(`/analytics/overview?${RANGE}`);
    expect(body.totals).toMatchObject({ commits: 6, activeDevelopers: 2, unassignedCommits: 1, mergeCommits: 1, activeRepositories: 2, connectedRepositories: 2 });
  });

  it("toggles bots and merges", async () => {
    expect((await get<Overview>(`/analytics/overview?${RANGE}&includeBots=true`)).body.totals.commits).toBe(7);
    expect((await get<Overview>(`/analytics/overview?${RANGE}&includeMerges=false`)).body.totals.commits).toBe(5);
  });

  it("zero-fills quiet days and all 24 hours", async () => {
    const { body } = await get<Overview>("/analytics/overview?range=custom&from=2026-10-01&to=2026-10-07");
    expect(body.dailyTrend).toHaveLength(7);
    expect(body.dailyTrend.filter((d) => d.commits === 0)).toHaveLength(5);
    expect(body.hourlyActivity).toHaveLength(24);
    expect(body.hourlyActivity.find((h) => h.hour === 23)?.commits).toBe(1);
    expect(body.hourlyActivity.find((h) => h.hour === 0)?.commits).toBe(1);
  });

  it("ranks the leaderboard and lists unassigned as null, not guessed", async () => {
    const { body } = await get<Overview>(`/analytics/overview?${RANGE}`);
    expect(body.leaderboard.map((l) => [l.developer?.login ?? null, l.commits])).toEqual([["alice", 3], ["bob", 2], [null, 1]]);
    expect(body.repositoryDistribution.map((r) => [r.name, r.commits])).toEqual([["org-a/api", 5], ["org-a/web", 1]]);
    expect(body.recentCommits[0]?.sha).toBe("r1");
  });

  it("filters by repository and by branch", async () => {
    expect((await get<Overview>(`/analytics/overview?${RANGE}&repositoryId=12`)).body.totals.commits).toBe(1);
    expect((await get<Overview>(`/analytics/overview?${RANGE}&branch=main`)).body.totals.commits).toBe(6);
    expect((await get<Overview>(`/analytics/overview?${RANGE}&branch=missing`)).body.totals.commits).toBe(0);
  });

  it("ignores commits stamped in the future", async () => {
    await db.update(schema.commit).set({ committedAt: new Date(Date.now() + 86_400_000) }).where(
      (await import("drizzle-orm")).eq(schema.commit.sha, "a1"));
    const { body } = await get<Overview>(`/analytics/overview?${RANGE}`);
    expect(body.totals.commits).toBe(5);
  });
});

describe("developers", () => {
  type DevList = { items: { login: string; commits: number; repositories: number; mergeCommits: number }[]; total: number };
  type DevDetail = {
    summary: { commits: number; repositories: number; mergeCommits: number; lifetimeCommits: number; firstCommitAt: string };
    linkedAccounts: { login: string }[]; employee: { name: string } | null; repositories: { name: string; commits: number }[];
    dailyTrend: { day: string; commits: number }[];
  };

  it("lists developers with their stats, never listing unassigned as a person", async () => {
    const { body } = await get<DevList>(`/developers?${RANGE}`);
    expect(body.items.map((d) => [d.login, d.commits, d.repositories])).toEqual([["alice", 3, 1], ["bob", 2, 2]]);
    expect(body.total).toBe(2);
    expect(body.items[0]?.mergeCommits).toBe(1);
  });

  it("searches and paginates", async () => {
    expect((await get<DevList>(`/developers?${RANGE}&q=bo`)).body.items.map((d) => d.login)).toEqual(["bob"]);
    const page = await get<DevList>(`/developers?${RANGE}&pageSize=1&page=2`);
    expect(page.body.items.map((d) => d.login)).toEqual(["bob"]);
    expect(page.body.total).toBe(2);
  });

  it("returns a profile with per-repository breakdown and linked GitHub accounts", async () => {
    const [emp] = await db.insert(schema.employee).values({ displayName: "Alice Example" }).returning({ id: schema.employee.id });
    await db.insert(schema.developerAccount).values({ id: 99, login: "alice_work", type: "User" });
    await db.insert(schema.employeeDeveloperAccount).values([{ employeeId: emp?.id ?? 0, developerAccountId: 1 }, { employeeId: emp?.id ?? 0, developerAccountId: 99 }]);
    const { body } = await get<DevDetail>(`/developers/1?${RANGE}`);
    expect(body.summary).toMatchObject({ commits: 3, repositories: 1, mergeCommits: 1, lifetimeCommits: 3 });
    expect(body.employee?.name).toBe("Alice Example");
    expect(body.linkedAccounts.map((a) => a.login)).toEqual(["alice", "alice_work"]);
    expect(body.repositories).toEqual([expect.objectContaining({ name: "org-a/api", commits: 3 })]);
    expect(body.dailyTrend).toEqual([{ day: "2026-10-05", commits: 1 }, { day: "2026-10-06", commits: 2 }]);
  });

  it("keeps all-time first/latest independent of the selected range", async () => {
    const { body } = await get<DevDetail>("/developers/1?range=custom&from=2026-10-06&to=2026-10-06");
    expect(body.summary.commits).toBe(2);
    expect(body.summary.lifetimeCommits).toBe(3);
    expect(body.summary.firstCommitAt).toBe("2026-10-05T18:29:59.000Z");
  });

  it("404s for unknown developers", async () => {
    expect((await get<{ error: string }>("/developers/12345")).status).toBe(404);
  });
});

describe("repositories", () => {
  type RepoList = { items: { name: string; commits: number; contributors: number }[]; total: number };
  type RepoDetail = {
    repository: { name: string; commits: number }; branches: { name: string; isDefault: boolean; commits: number }[];
    contributors: { developer: { login: string } | null; commits: number }[];
  };

  it("lists repositories with commit and contributor counts, including quiet ones", async () => {
    const { body } = await get<RepoList>(`/repositories?${RANGE}`);
    expect(body.items.map((r) => [r.name, r.commits, r.contributors])).toEqual([["org-a/api", 5, 2], ["org-a/web", 1, 1]]);
    const quiet = await get<RepoList>("/repositories?range=custom&from=2026-01-01&to=2026-01-02");
    expect(quiet.body.items.map((r) => r.commits)).toEqual([0, 0]);
    expect(quiet.body.total).toBe(2);
  });

  it("shows branches and contributors for one repository", async () => {
    const { body } = await get<RepoDetail>(`/repositories/11?${RANGE}`);
    expect(body.repository).toMatchObject({ name: "org-a/api", commits: 5 });
    expect(body.branches).toEqual([expect.objectContaining({ name: "main", isDefault: true, commits: 6 })]);
    expect(body.contributors.map((c) => [c.developer?.login ?? null, c.commits])).toEqual([["alice", 3], ["bob", 1], [null, 1]]);
  });
});

describe("commit search", () => {
  type Commits = { items: { sha: string; developer: { login: string } | null; title: string }[]; total: number };

  it("searches by message, sha, repository and author, case-insensitively", async () => {
    expect((await get<Commits>(`/commits?${RANGE}&q=MSG%20B1`)).body.items.map((c) => c.sha)).toEqual(["b1"]);
    expect((await get<Commits>(`/commits?${RANGE}&q=org-a/web`)).body.items.map((c) => c.sha)).toEqual(["r1"]);
    expect((await get<Commits>(`/commits?${RANGE}&q=alice`)).body.total).toBe(3);
  });

  it("treats LIKE wildcards in the search term literally", async () => {
    expect((await get<Commits>(`/commits?${RANGE}&q=%25`)).body.total).toBe(0);
  });

  it("filters by author vs committer attribution and paginates newest first", async () => {
    const all = await get<Commits>(`/commits?${RANGE}&pageSize=2&page=2`);
    expect(all.body.total).toBe(6);
    expect(all.body.items.map((c) => c.sha)).toEqual(["u1", "b1"]);
    expect((await get<Commits>(`/commits?${RANGE}&developerId=2&attribution=committer`)).body.total).toBe(2);
  });
});

describe("input validation", () => {
  it.each([
    ["custom range without dates", "/analytics/overview?range=custom"],
    ["end before start", "/analytics/overview?range=custom&from=2026-10-06&to=2026-10-05"],
    ["unknown timezone", "/analytics/overview?timezone=Mars/Base"],
    ["range over 366 days", "/analytics/overview?range=custom&from=2024-01-01&to=2026-01-01"],
    ["page size over 100", "/commits?pageSize=500"],
    ["non-numeric id", "/developers/abc"],
  ])("rejects %s with 400", async (_name, path) => {
    expect((await get<{ error: string }>(path)).status).toBe(400);
  });
});

describe("response types", () => {
  it("returns ids and counts as numbers everywhere, never strings", async () => {
    const overview = (await get<{ leaderboard: { developer: { id: unknown } | null; commits: unknown }[]; repositoryDistribution: { id: unknown }[]; recentCommits: { id: unknown; repository: { id: unknown }; developer: { id: unknown } | null }[] }>(`/analytics/overview?${RANGE}`)).body;
    expect(overview.leaderboard.every((l) => typeof l.commits === "number" && (l.developer === null || typeof l.developer.id === "number"))).toBe(true);
    expect(overview.repositoryDistribution.every((r) => typeof r.id === "number")).toBe(true);
    expect(overview.recentCommits.every((c) => typeof c.id === "number" && typeof c.repository.id === "number" && (c.developer === null || typeof c.developer.id === "number"))).toBe(true);
    const devs = (await get<{ items: { id: unknown }[] }>(`/developers?${RANGE}`)).body.items;
    expect(devs.every((d) => typeof d.id === "number")).toBe(true);
    const repos = (await get<{ items: { id: unknown }[] }>(`/repositories?${RANGE}`)).body.items;
    expect(repos.every((r) => typeof r.id === "number")).toBe(true);
    const groups = (await get<{ groups: { id: unknown }[] }>(`/analytics/breakdown?${RANGE}&by=organization`)).body.groups;
    expect(groups.every((g) => typeof g.id === "number")).toBe(true);
  });
});
