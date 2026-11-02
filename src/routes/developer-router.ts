import { Hono } from "hono";
import { ROLES } from "../constants/roles.js";
import { handleGetDeveloper, handleListDevelopers } from "../handlers/developer-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import { requireRole } from "../middlewares/is-authorized.js";
import type { AppBindings } from "../types/app.types.js";

export const developerRouter = new Hono<AppBindings>()
  .use(isAuthenticated, requireRole(ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUPER_ADMIN))
  .get("/", ...handleListDevelopers)
  .get("/:id", ...handleGetDeveloper);
