import { Hono } from "hono";
import { handleGetMeta } from "../handlers/meta-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import type { AppBindings } from "../types/app.types.js";

export const metaRouter = new Hono<AppBindings>().use(isAuthenticated).get("/", ...handleGetMeta);
