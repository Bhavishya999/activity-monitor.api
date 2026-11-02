import { Hono } from "hono";
import { handleLiveness, handleReadiness } from "../handlers/health-handlers.js";
import type { AppBindings } from "../types/app.types.js";

export const healthRouter = new Hono<AppBindings>()
  .get("/healthz", handleLiveness)
  .get("/readyz", handleReadiness);
