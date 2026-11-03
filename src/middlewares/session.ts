import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { authConfig } from "../config/auth-config.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import { getSessionUser } from "../helpers/auth-helper.js";
import type { AppBindings } from "../types/app.types.js";

export const sessionMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const rawToken = getCookie(c, authConfig.cookieName);
  if (!rawToken) throw new UnauthorizedException("Not authenticated");

  const result = await getSessionUser(c.var.deps.db, rawToken);
  if (!result) throw new UnauthorizedException("Session expired");

  c.set("user", result.sessionUser);
  c.set("sessionCsrfToken", result.csrfToken);

  await next();
});
