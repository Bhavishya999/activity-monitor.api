import { Hono } from "hono";
import { sessionMiddleware } from "../middlewares/session.js";
import { requireRole } from "../middlewares/require-role.js";
import { requireCsrf } from "../middlewares/require-csrf.js";
import { validateReq } from "../validations/validate-req.js";
import {
  vListAuditQuery,
  vListUsersQuery,
  vUpdateUser,
  vUpsertSetting,
} from "../validations/schemas/admin/admin-schemas.js";
import {
  handleGetSettings,
  handleListAudit,
  handleListUsers,
  handleUpdateUser,
  handleUpsertSetting,
} from "../handlers/admin-handlers.js";
import type { AppBindings } from "../types/app.types.js";

export const adminRouter = new Hono<AppBindings>();

adminRouter.use("*", sessionMiddleware, requireRole("SUPER_ADMIN"));

adminRouter.get("/users", validateReq("query", vListUsersQuery), handleListUsers);
adminRouter.put("/users/:id", requireCsrf, validateReq("json", vUpdateUser), handleUpdateUser);

adminRouter.get("/settings", handleGetSettings);
adminRouter.put("/settings", requireCsrf, validateReq("json", vUpsertSetting), handleUpsertSetting);

adminRouter.get("/audit", validateReq("query", vListAuditQuery), handleListAudit);
