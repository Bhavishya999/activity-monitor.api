import {
  countAuditLogs,
  countUsers,
  getAllSettings,
  listAuditLogs,
  listUsers,
  updateUser,
  upsertSetting,
} from "../services/database/admin-db-service.js";
import { NotFoundException } from "../exceptions/not-found-exception.js";
import type { AppHandler } from "../factory.js";
import type { z } from "zod";
import type { vListAuditQuery, vListUsersQuery, vUpdateUser, vUpsertSetting } from "../validations/schemas/admin/admin-schemas.js";

export const handleListUsers: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vListUsersQuery>;
  const { db } = c.var.deps;

  const [users, total] = await Promise.all([
    listUsers(db, q.page, q.pageSize, q.search),
    countUsers(db, q.search),
  ]);

  return c.json({
    users: users.map((u) => ({
      ...u,
      lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  }, 200);
};

export const handleUpdateUser: AppHandler = async (c) => {
  const id = Number(c.req.param("id"));
  const body = c.get("validated") as z.infer<typeof vUpdateUser>;
  const { db } = c.var.deps;

  const patch = {
    ...(body.role !== undefined ? { role: body.role } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
  };

  const user = await updateUser(db, id, patch);
  if (!user) throw new NotFoundException("User not found");

  return c.json({
    user: {
      ...user,
      lastLoginAt: user.lastLoginAt instanceof Date ? user.lastLoginAt.toISOString() : null,
    },
  }, 200);
};

export const handleGetSettings: AppHandler = async (c) => {
  const rows = await getAllSettings(c.var.deps.db);
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return c.json({ settings }, 200);
};

export const handleUpsertSetting: AppHandler = async (c) => {
  const { key, value } = c.get("validated") as z.infer<typeof vUpsertSetting>;
  const row = await upsertSetting(c.var.deps.db, key, value);
  return c.json({ key: row.key, value: row.value }, 200);
};

export const handleListAudit: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vListAuditQuery>;
  const { db } = c.var.deps;

  const [logs, total] = await Promise.all([
    listAuditLogs(db, q.page, q.pageSize),
    countAuditLogs(db),
  ]);

  return c.json({
    logs: logs.map((l) => ({
      ...l,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  }, 200);
};
