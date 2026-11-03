import { Hono } from "hono";
import { sessionMiddleware } from "../middlewares/session.js";
import { requireRole } from "../middlewares/require-role.js";
import { requireCsrf } from "../middlewares/require-csrf.js";
import { validateReq } from "../validations/validate-req.js";
import { vSyncRunsQuery, vTriggerSync } from "../validations/schemas/sync/sync-schemas.js";
import { handleListSyncRuns, handleTriggerSync } from "../handlers/sync-handlers.js";
import type { AppBindings } from "../types/app.types.js";

export const syncRouter = new Hono<AppBindings>();

syncRouter.use("*", sessionMiddleware, requireRole("SUPER_ADMIN"));

syncRouter.get("/runs", validateReq("query", vSyncRunsQuery), handleListSyncRuns);
syncRouter.post("/trigger", requireCsrf, validateReq("json", vTriggerSync), handleTriggerSync);
