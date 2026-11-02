import { Hono } from "hono";
import { ROLES } from "../constants/roles.js";
import { handleListCommits } from "../handlers/commit-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import { requireRole } from "../middlewares/is-authorized.js";
import type { AppBindings } from "../types/app.types.js";

export const commitRouter = new Hono<AppBindings>()
  .use(isAuthenticated, requireRole(ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUPER_ADMIN))
  .get("/", ...handleListCommits);
