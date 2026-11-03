import { Hono } from "hono";
import { sessionMiddleware } from "../middlewares/session.js";
import { requireRole } from "../middlewares/require-role.js";
import { validateReq } from "../validations/validate-req.js";
import {
  vCommitsQuery,
  vDevelopersQuery,
  vOverviewQuery,
  vRepositoriesQuery,
} from "../validations/schemas/analytics/analytics-schemas.js";
import {
  handleGetDeveloper,
  handleGetOverview,
  handleGetRepository,
  handleListCommits,
  handleListDevelopers,
  handleListRepositories,
} from "../handlers/analytics-handlers.js";
import type { AppBindings } from "../types/app.types.js";

export const analyticsRouter = new Hono<AppBindings>();

analyticsRouter.use("*", sessionMiddleware, requireRole("SUPER_ADMIN"));

analyticsRouter.get("/overview", validateReq("query", vOverviewQuery), handleGetOverview);
analyticsRouter.get("/developers", validateReq("query", vDevelopersQuery), handleListDevelopers);
analyticsRouter.get("/developers/:id", validateReq("query", vOverviewQuery), handleGetDeveloper);
analyticsRouter.get("/repositories", validateReq("query", vRepositoriesQuery), handleListRepositories);
analyticsRouter.get("/repositories/:id", validateReq("query", vOverviewQuery), handleGetRepository);
analyticsRouter.get("/commits", validateReq("query", vCommitsQuery), handleListCommits);
