import { Hono } from "hono";
import { sessionMiddleware } from "../middlewares/session.js";
import { requireRole } from "../middlewares/require-role.js";
import { handleListGithubAccounts } from "../handlers/github-accounts-handlers.js";
import type { AppBindings } from "../types/app.types.js";

export const githubAccountsRouter = new Hono<AppBindings>();

githubAccountsRouter.use("*", sessionMiddleware, requireRole("SUPER_ADMIN"));

githubAccountsRouter.get("/", handleListGithubAccounts);
