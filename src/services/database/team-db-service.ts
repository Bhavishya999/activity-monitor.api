import { and, eq, inArray, sql } from "drizzle-orm";
import { one, schema, type Db } from "../../database/client.js";

const { team, teamMember, developerAccount } = schema;

export type TeamRow = {
  id: number; name: string; slug: string; description: string | null; color: string | null; memberCount: number;
};
export type TeamMemberRow = { id: number; login: string; avatarUrl: string | null };
export type TeamInput = { name: string; slug: string; description: string | null; color: string | null };

const teamColumns = {
  id: team.id, name: team.name, slug: team.slug, description: team.description, color: team.color,
  memberCount: sql<number>`(select count(*) from team_member tm where tm.team_id = ${team.id})::int`,
};

export async function listTeamRows(db: Db): Promise<TeamRow[]> {
  return db.select(teamColumns).from(team).orderBy(team.name);
}

export async function findTeamRow(db: Db, id: number): Promise<TeamRow | null> {
  const rows = await db.select(teamColumns).from(team).where(eq(team.id, id));
  return rows[0] ?? null;
}

export async function findTeamBySlug(db: Db, slug: string, excludeId: number | null = null): Promise<{ id: number } | null> {
  const rows = await db.select({ id: team.id }).from(team).where(eq(team.slug, slug));
  const found = rows[0];
  return found && found.id !== excludeId ? found : null;
}

export async function insertTeamRow(db: Db, input: TeamInput): Promise<number> {
  return one(await db.insert(team).values(input).returning({ id: team.id }), "team").id;
}

export async function updateTeamRow(db: Db, id: number, input: Partial<TeamInput>): Promise<void> {
  await db.update(team).set({ ...input, updatedAt: new Date() }).where(eq(team.id, id));
}

export async function deleteTeamRow(db: Db, id: number): Promise<void> {
  await db.delete(team).where(eq(team.id, id));
}

export async function listTeamMembers(db: Db, teamId: number): Promise<TeamMemberRow[]> {
  return db.select({ id: developerAccount.id, login: developerAccount.login, avatarUrl: developerAccount.avatarUrl })
    .from(teamMember).innerJoin(developerAccount, eq(developerAccount.id, teamMember.developerAccountId))
    .where(eq(teamMember.teamId, teamId)).orderBy(developerAccount.login);
}

export async function countExistingAccounts(db: Db, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db.select({ id: developerAccount.id }).from(developerAccount).where(inArray(developerAccount.id, ids));
  return rows.length;
}

/** Replaces the whole member set atomically so a team never shows a half-applied list. */
export async function replaceTeamMembers(db: Db, teamId: number, accountIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(teamMember).where(eq(teamMember.teamId, teamId));
    if (accountIds.length > 0) await tx.insert(teamMember).values(accountIds.map((developerAccountId) => ({ teamId, developerAccountId })));
  });
}

export async function isMember(db: Db, teamId: number, accountId: number): Promise<boolean> {
  const rows = await db.select({ id: teamMember.teamId }).from(teamMember).where(and(eq(teamMember.teamId, teamId), eq(teamMember.developerAccountId, accountId)));
  return rows.length > 0;
}
