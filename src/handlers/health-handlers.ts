import type { AppHandler } from "../factory.js";
import { checkDatabase } from "../services/database/webhook-db-service.js";

export const handleLiveness: AppHandler = (c) => c.json({ ok: true });

export const handleReadiness: AppHandler = async (c) => {
  try { await checkDatabase(c.get("deps").db); return c.json({ ok: true }); } catch { return c.json({ ok: false }, 503); }
};
