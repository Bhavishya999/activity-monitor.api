import { APP_MESSAGES } from "../constants/app-messages.js";
import { BadRequestException } from "../exceptions/bad-request-exception.js";
import { ConflictException } from "../exceptions/conflict-exception.js";
import { NotFoundException } from "../exceptions/not-found-exception.js";
import { insertAuditLog } from "../services/database/audit-db-service.js";
import {
  countExistingAccounts, deleteTeamRow, findTeamBySlug, findTeamRow, insertTeamRow, listTeamMembers, listTeamRows, replaceTeamMembers, updateTeamRow,
  type TeamMemberRow, type TeamRow,
} from "../services/database/team-db-service.js";
import type { AppDeps, AuthUser } from "../types/app.types.js";

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function requireTeam(deps: AppDeps, id: number): Promise<TeamRow> {
  const found = await findTeamRow(deps.db, id);
  if (!found) throw new NotFoundException(APP_MESSAGES.TEAM_NOT_FOUND);
  return found;
}

export async function listTeams(deps: AppDeps): Promise<TeamRow[]> {
  return listTeamRows(deps.db);
}

export async function getTeam(deps: AppDeps, id: number): Promise<TeamRow & { members: TeamMemberRow[] }> {
  const found = await requireTeam(deps, id);
  return { ...found, members: await listTeamMembers(deps.db, id) };
}

type TeamFields = { name?: string | undefined; description?: string | undefined; color?: string | undefined };

export async function createTeam(deps: AppDeps, actor: AuthUser, input: TeamFields & { name: string }): Promise<TeamRow> {
  const slug = slugify(input.name);
  if (slug === "") throw new BadRequestException("Team name must contain letters or numbers");
  if (await findTeamBySlug(deps.db, slug)) throw new ConflictException(APP_MESSAGES.TEAM_EXISTS);
  const id = await insertTeamRow(deps.db, { name: input.name, slug, description: input.description ?? null, color: input.color ?? null });
  await insertAuditLog(deps.db, { actorUserId: actor.id, action: "team.create", targetType: "team", targetId: String(id), metadata: { name: input.name } });
  return requireTeam(deps, id);
}

export async function updateTeam(deps: AppDeps, actor: AuthUser, id: number, input: TeamFields): Promise<TeamRow> {
  await requireTeam(deps, id);
  const patch: { name?: string; slug?: string; description?: string | null; color?: string | null } = {};
  if (input.name !== undefined) {
    const slug = slugify(input.name);
    if (await findTeamBySlug(deps.db, slug, id)) throw new ConflictException(APP_MESSAGES.TEAM_EXISTS);
    patch.name = input.name; patch.slug = slug;
  }
  if (input.description !== undefined) patch.description = input.description;
  if (input.color !== undefined) patch.color = input.color;
  await updateTeamRow(deps.db, id, patch);
  await insertAuditLog(deps.db, { actorUserId: actor.id, action: "team.update", targetType: "team", targetId: String(id), metadata: { fields: Object.keys(patch) } });
  return requireTeam(deps, id);
}

export async function setTeamMembers(deps: AppDeps, actor: AuthUser, id: number, accountIds: number[]): Promise<TeamMemberRow[]> {
  await requireTeam(deps, id);
  if (await countExistingAccounts(deps.db, accountIds) !== accountIds.length) throw new BadRequestException(APP_MESSAGES.UNKNOWN_DEVELOPER_ACCOUNTS);
  await replaceTeamMembers(deps.db, id, accountIds);
  await insertAuditLog(deps.db, { actorUserId: actor.id, action: "team.members.set", targetType: "team", targetId: String(id), metadata: { count: accountIds.length } });
  return listTeamMembers(deps.db, id);
}

export async function deleteTeam(deps: AppDeps, actor: AuthUser, id: number): Promise<void> {
  const found = await requireTeam(deps, id);
  await deleteTeamRow(deps.db, id);
  await insertAuditLog(deps.db, { actorUserId: actor.id, action: "team.delete", targetType: "team", targetId: String(id), metadata: { name: found.name } });
}
