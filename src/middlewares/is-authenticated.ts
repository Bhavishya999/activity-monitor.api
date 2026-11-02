import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { CSRF_HEADER, SESSION_COOKIE } from "../constants/roles.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import { ForbiddenException } from "../exceptions/forbidden-exception.js";
import { resolveSession } from "../helpers/auth-helper.js";
import type { AppBindings } from "../types/app.types.js";

const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/** Session cookie -> user on the context. State-changing requests must also present the CSRF token. */
export const isAuthenticated = createMiddleware<AppBindings>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new UnauthorizedException(APP_MESSAGES.NOT_AUTHENTICATED);
  const found = await resolveSession(c.get("deps"), token);
  if (!found) throw new UnauthorizedException(APP_MESSAGES.SESSION_EXPIRED);
  if (!SAFE_METHODS.has(c.req.method) && c.req.header(CSRF_HEADER) !== found.csrfToken) {
    throw new ForbiddenException(APP_MESSAGES.CSRF_INVALID);
  }
  c.set("user", found.user);
  c.set("csrfToken", found.csrfToken);
  await next();
});
