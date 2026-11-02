import { Hono } from "hono";
import { ROLES } from "../constants/roles.js";
import {
  handleCreateTeam, handleDeleteTeam, handleGetTeam, handleListTeams, handleSetTeamMembers, handleUpdateTeam,
} from "../handlers/team-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import { requireRole } from "../middlewares/is-authorized.js";
import type { AppBindings } from "../types/app.types.js";

const canRead = requireRole(ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUPER_ADMIN);
const canManage = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);

// Everyone signed in can see teams (they are filters); only admins change them.
export const teamRouter = new Hono<AppBindings>()
  .use(isAuthenticated)
  .get("/", canRead, ...handleListTeams)
  .get("/:id", canRead, ...handleGetTeam)
  .post("/", canManage, ...handleCreateTeam)
  .patch("/:id", canManage, ...handleUpdateTeam)
  .put("/:id/members", canManage, ...handleSetTeamMembers)
  .delete("/:id", canManage, ...handleDeleteTeam);
