import { Hono } from "hono";
import { handleDevLogin, handleGetMe, handleLogout } from "../handlers/auth-handlers.js";
import { isAuthenticated } from "../middlewares/is-authenticated.js";
import type { AppBindings } from "../types/app.types.js";

export const authRouter = new Hono<AppBindings>()
  .post("/dev-login", ...handleDevLogin)
  .get("/me", isAuthenticated, ...handleGetMe)
  .post("/logout", isAuthenticated, ...handleLogout);
