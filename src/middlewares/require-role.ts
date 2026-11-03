import { createMiddleware } from "hono/factory";
import { ForbiddenException } from "../exceptions/forbidden-exception.js";
import type { AppBindings, SessionUser } from "../types/app.types.js";

export function requireRole(...roles: SessionUser["role"][]): ReturnType<typeof createMiddleware<AppBindings>> {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }
    await next();
  });
}
