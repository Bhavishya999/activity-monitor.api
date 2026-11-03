import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { authConfig } from "../config/auth-config.js";
import { ForbiddenException } from "../exceptions/forbidden-exception.js";
import type { AppBindings } from "../types/app.types.js";

export const requireCsrf = createMiddleware<AppBindings>(async (c, next) => {
  const incoming = c.req.header(authConfig.csrfHeader);
  const expected = c.get("sessionCsrfToken");

  if (!incoming || !expected) throw new ForbiddenException("CSRF token missing");

  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ForbiddenException("CSRF token invalid");
  }

  await next();
});
