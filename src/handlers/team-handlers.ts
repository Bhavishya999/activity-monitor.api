import { factory } from "../factory.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import { createTeam, deleteTeam, getTeam, listTeams, setTeamMembers, updateTeam } from "../helpers/team-helper.js";
import { vIdParamSchema } from "../validations/schemas/analytics/analytics-schemas.js";
import { vTeamCreateSchema, vTeamMembersSchema, vTeamUpdateSchema } from "../validations/schemas/teams/team-schemas.js";
import { validateReq } from "../validations/validate-req.js";
import type { AuthUser } from "../types/app.types.js";
import type { Context } from "hono";
import type { AppBindings } from "../types/app.types.js";

function actorOf(c: Context<AppBindings>): AuthUser {
  const user = c.get("user");
  if (!user) throw new UnauthorizedException(APP_MESSAGES.NOT_AUTHENTICATED);
  return user;
}

export const handleListTeams = factory.createHandlers(async (c) => c.json({ items: await listTeams(c.get("deps")) }));

export const handleGetTeam = factory.createHandlers(validateReq("param", vIdParamSchema), async (c) => {
  return c.json(await getTeam(c.get("deps"), c.req.valid("param").id));
});

export const handleCreateTeam = factory.createHandlers(validateReq("json", vTeamCreateSchema), async (c) => {
  return c.json(await createTeam(c.get("deps"), actorOf(c), c.req.valid("json")), 201);
});

export const handleUpdateTeam = factory.createHandlers(validateReq("param", vIdParamSchema), validateReq("json", vTeamUpdateSchema), async (c) => {
  return c.json(await updateTeam(c.get("deps"), actorOf(c), c.req.valid("param").id, c.req.valid("json")));
});

export const handleSetTeamMembers = factory.createHandlers(validateReq("param", vIdParamSchema), validateReq("json", vTeamMembersSchema), async (c) => {
  const members = await setTeamMembers(c.get("deps"), actorOf(c), c.req.valid("param").id, c.req.valid("json").developerAccountIds);
  return c.json({ members });
});

export const handleDeleteTeam = factory.createHandlers(validateReq("param", vIdParamSchema), async (c) => {
  await deleteTeam(c.get("deps"), actorOf(c), c.req.valid("param").id);
  return c.json({ ok: true });
});
