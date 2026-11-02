import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { APP_MESSAGES } from "../constants/app-messages.js";
import type { Role } from "../constants/roles.js";
import { ForbiddenException } from "../exceptions/forbidden-exception.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import type { AppBindings } from "../types/app.types.js";

/** Server-side role gate; must run after isAuthenticated. */
export function requireRole(...allowed: readonly Role[]): MiddlewareHandler<AppBindings> {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw new UnauthorizedException(APP_MESSAGES.NOT_AUTHENTICATED);
    if (!allowed.includes(user.role)) throw new ForbiddenException(APP_MESSAGES.FORBIDDEN_ROLE);
    await next();
  });
}
