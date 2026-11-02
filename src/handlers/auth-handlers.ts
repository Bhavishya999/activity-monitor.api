import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { factory } from "../factory.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { SESSION_COOKIE } from "../constants/roles.js";
import { UnauthorizedException } from "../exceptions/unauthorized-exception.js";
import { endSession, startDevSession } from "../helpers/auth-helper.js";
import { vDevLoginSchema } from "../validations/schemas/auth/auth-schemas.js";
import { validateReq } from "../validations/validate-req.js";

export const handleDevLogin = factory.createHandlers(validateReq("json", vDevLoginSchema), async (c) => {
  const deps = c.get("deps");
  const { email, role } = c.req.valid("json");
  const session = await startDevSession(deps, email, role);
  setCookie(c, SESSION_COOKIE, session.token, {
    httpOnly: true, secure: deps.auth.secureCookies, sameSite: "Lax", path: "/", expires: session.expiresAt,
  });
  return c.json({ csrfToken: session.csrfToken });
});

export const handleGetMe = factory.createHandlers(async (c) => {
  const user = c.get("user");
  if (!user) throw new UnauthorizedException(APP_MESSAGES.NOT_AUTHENTICATED);
  return c.json({ user, csrfToken: c.get("csrfToken") });
});

export const handleLogout = factory.createHandlers(async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await endSession(c.get("deps"), token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
