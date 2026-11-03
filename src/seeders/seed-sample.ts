/**
 * DEVELOPMENT ONLY. Fills a database named "*sample*" with clearly fake data so the UI can be designed without
 * real GitHub access. It flags the database as sample data (the UI shows a permanent banner) and refuses to run
 * against production or against any database whose name does not contain "sample".
 */
import { createDb, schema } from "../database/client.js";
import { SETTING_SAMPLE_DATA } from "../helpers/meta-helper.js";

const url = process.env["DATABASE_URL"] ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";
if (process.env["NODE_ENV"] === "production" || !/sample/i.test(dbName)) {
  throw new Error(`Refusing to seed: database "${dbName}" is not a sample database (name must contain "sample") or NODE_ENV=production`);
}

// Deterministic PRNG so the sample dataset is the same on every machine.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261103);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

const { db, pool } = createDb(url, 2);

const ORGS = [{ id: 9001, login: "sample-org-alpha", installation: 7001 }, { id: 9002, login: "sample-org-beta", installation: 7002 }] as const;
const REPOS = [
  { id: 1, org: 0, name: "platform-api" }, { id: 2, org: 0, name: "web-dashboard" }, { id: 3, org: 0, name: "mobile-app" },
  { id: 4, org: 0, name: "design-system" }, { id: 5, org: 0, name: "infra" },
  { id: 6, org: 1, name: "data-pipeline" }, { id: 7, org: 1, name: "billing-service" }, { id: 8, org: 1, name: "docs" },
] as const;
const PEOPLE = [
  { id: 101, login: "sample-asha", weight: 9, repos: [1, 5, 6] }, { id: 102, login: "sample-bruno", weight: 8, repos: [1, 7] },
  { id: 103, login: "sample-chen", weight: 7, repos: [2, 4] }, { id: 104, login: "sample-dara", weight: 6, repos: [3, 2] },
  { id: 105, login: "sample-esi", weight: 6, repos: [2, 4, 8] }, { id: 106, login: "sample-farid", weight: 5, repos: [5, 6] },
  { id: 107, login: "sample-gita", weight: 5, repos: [3] }, { id: 108, login: "sample-hugo", weight: 4, repos: [7, 1] },
  { id: 109, login: "sample-ines", weight: 3, repos: [8, 4] }, { id: 110, login: "sample-jonas", weight: 2, repos: [6] },
  { id: 111, login: "sample-kavya", weight: 2, repos: [3, 2] },
] as const;
const BOT = { id: 199, login: "sample-dependabot[bot]" } as const;
const MESSAGES = [
  "Add pagination to list endpoint", "Fix race condition in sync worker", "Refactor auth middleware", "Update dependencies",
  "Improve loading states", "Add unit tests for date helpers", "Handle empty repository gracefully", "Tune database indexes",
  "Polish dashboard spacing", "Rename config keys", "Add retry with backoff", "Fix timezone off-by-one in report",
  "Document webhook setup", "Cache installation tokens", "Remove unused feature flag",
] as const;

async function main(): Promise<void> {
  await db.execute((await import("drizzle-orm")).sql`truncate github_account, developer_account, team, setting restart identity cascade`);

  await db.insert(schema.githubAccount).values(ORGS.map((o) => ({ id: o.id, login: o.login, type: "Organization" as const, avatarUrl: null, htmlUrl: null })));
  await db.insert(schema.githubInstallation).values(ORGS.map((o) => ({ id: o.installation, accountId: o.id, status: "active" as const, lastSyncedAt: new Date() })));
  await db.insert(schema.repository).values(REPOS.map((r) => {
    const org = ORGS[r.org];
    if (!org) throw new Error("bad org");
    return { id: r.id, installationId: org.installation, ownerId: org.id, name: r.name, fullName: `${org.login}/${r.name}`, private: r.id % 3 === 0, defaultBranch: "main", lastSyncedAt: new Date() };
  }));
  await db.insert(schema.developerAccount).values([
    ...PEOPLE.map((p) => ({ id: p.id, login: p.login, type: "User" as const, avatarUrl: null, htmlUrl: null })),
    { id: BOT.id, login: BOT.login, type: "Bot" as const, avatarUrl: null, htmlUrl: null },
  ]);

  const branchIds = new Map<number, { main: number; feature: number }>();
  for (const r of REPOS) {
    const rows = await db.insert(schema.branch).values([
      { repositoryId: r.id, name: "main", isDefault: true, lastImportedAt: new Date() },
      { repositoryId: r.id, name: "feature/sample", isDefault: false, lastImportedAt: new Date() },
    ]).returning({ id: schema.branch.id });
    branchIds.set(r.id, { main: rows[0]?.id ?? 0, feature: rows[1]?.id ?? 0 });
  }

  // 120 days of activity: busier on weekdays, peaking late morning and mid-afternoon, quiet nights.
  const hourWeights = [0, 0, 0, 0, 0, 1, 2, 4, 8, 12, 14, 12, 8, 9, 13, 14, 12, 9, 6, 4, 3, 2, 1, 0];
  const hourPool = hourWeights.flatMap((w, h) => Array.from({ length: w }, () => h));
  const now = Date.now();
  const weighted = PEOPLE.flatMap((p) => Array.from({ length: p.weight }, () => p));
  const rows: (typeof schema.commit.$inferInsert)[] = [];
  let sha = 0;
  for (let d = 119; d >= 0; d--) {
    const day = new Date(now - d * 86_400_000);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const count = Math.floor((weekend ? 2 : 14) * (0.4 + rand() * 1.2));
    for (let i = 0; i < count; i++) {
      const person = pick(weighted);
      const repoId = pick(person.repos);
      const at = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), pick(hourPool), Math.floor(rand() * 60), Math.floor(rand() * 60)) - 19_800_000);
      if (at.getTime() > now) continue;
      const isBot = rand() < 0.04;
      const who = isBot ? BOT.id : person.id;
      const merge = !isBot && rand() < 0.08;
      sha += 1;
      rows.push({
        repositoryId: repoId, sha: sha.toString(16).padStart(40, "0"), message: `${pick(MESSAGES)}\n\nSample data`,
        authorAccountId: rand() < 0.03 ? null : who, committerAccountId: who, authorName: "Sample", committerName: "Sample",
        authoredAt: at, committedAt: at, htmlUrl: null, parentCount: merge ? 2 : 1, isMerge: merge,
        additions: Math.floor(rand() * 220), deletions: Math.floor(rand() * 90), changedFiles: 1 + Math.floor(rand() * 9), source: "import",
      });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const inserted = await db.insert(schema.commit).values(rows.slice(i, i + 500)).returning({ id: schema.commit.id, repositoryId: schema.commit.repositoryId });
    await db.insert(schema.commitBranch).values(inserted.map((c) => {
      const b = branchIds.get(c.repositoryId);
      return { commitId: c.id, branchId: (rand() < 0.8 ? b?.main : b?.feature) ?? 0 };
    })).onConflictDoNothing();
  }

  const teams = [
    { name: "Backend", slug: "backend", color: "#2a78d6", members: [101, 102, 106, 108, 110] },
    { name: "Frontend", slug: "frontend", color: "#eb6834", members: [103, 105, 109] },
    { name: "Mobile", slug: "mobile", color: "#1baf7a", members: [104, 107, 111] },
  ];
  for (const t of teams) {
    const [row] = await db.insert(schema.team).values({ name: t.name, slug: t.slug, color: t.color }).returning({ id: schema.team.id });
    if (row) await db.insert(schema.teamMember).values(t.members.map((developerAccountId) => ({ teamId: row.id, developerAccountId })));
  }

  await db.insert(schema.setting).values({ key: SETTING_SAMPLE_DATA, value: true });
  console.log(JSON.stringify({ msg: "sample data seeded", commits: rows.length, database: dbName }));
}

try { await main(); } finally { await pool.end(); }
