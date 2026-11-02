import { Hono } from "hono";
import { ROLES } from "../constants/roles.js";
import { handleGetRepository, handleListRepositories } from "../handlers/repository-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import { requireRole } from "../middlewares/is-authorized.js";
import type { AppBindings } from "../types/app.types.js";

export const repositoryRouter = new Hono<AppBindings>()
  .use(isAuthenticated, requireRole(ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUPER_ADMIN))
  .get("/", ...handleListRepositories)
  .get("/:id", ...handleGetRepository);
