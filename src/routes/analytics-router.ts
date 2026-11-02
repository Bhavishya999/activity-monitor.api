import { Hono } from "hono";
import { ROLES } from "../constants/roles.js";
import { handleGetOverview } from "../handlers/analytics-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import { requireRole } from "../middlewares/is-authorized.js";
import type { AppBindings } from "../types/app.types.js";

// Every signed-in role may read analytics (Developers see team analytics too); admin-only routes get their own gate.
export const analyticsRouter = new Hono<AppBindings>()
  .use(isAuthenticated, requireRole(ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUPER_ADMIN))
  .get("/overview", ...handleGetOverview);
