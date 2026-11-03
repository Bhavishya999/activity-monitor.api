import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { authConfig } from "../config/auth-config.js";
import { appConfig } from "../config/app-config.js";
import {
  forgotPassword,
  login,
  logout,
  resetPassword,
  verifyOtp,
} from "../helpers/auth-helper.js";
import type { AppHandler } from "../factory.js";
import type { z } from "zod";
import type { vForgotPassword, vLogin, vResetPassword, vVerifyOtp } from "../validations/schemas/auth/auth-schemas.js";

export const handleLogin: AppHandler = async (c) => {
  const { email, password } = c.get("validated") as z.infer<typeof vLogin>;
  const { deps } = c.var;

  const { rawSessionToken, csrfToken, user } = await login(deps.db, email, password);

  setCookie(c, authConfig.cookieName, rawSessionToken, {
    httpOnly: true,
    secure: appConfig.isProduction,
    sameSite: "Strict",
    path: "/",
    maxAge: authConfig.sessionTtlMs / 1000,
  });

  c.header(authConfig.csrfHeader, csrfToken);

  return c.json({ user }, 200);
};

export const handleLogout: AppHandler = async (c) => {
  const rawToken = getCookie(c, authConfig.cookieName) ?? "";
  const { deps } = c.var;

  await logout(deps.db, rawToken);

  deleteCookie(c, authConfig.cookieName, { path: "/" });

  return c.body(null, 204);
};

export const handleMe: AppHandler = async (c) => {
  const user = c.get("user");
  return c.json({ user }, 200);
};

export const handleForgotPassword: AppHandler = async (c) => {
  const { email } = c.get("validated") as z.infer<typeof vForgotPassword>;
  const { deps } = c.var;

  await forgotPassword(deps.db, email);

  // Always return 200 to prevent email enumeration
  return c.json({ message: "If that email is registered, a reset code was sent." }, 200);
};

export const handleVerifyOtp: AppHandler = async (c) => {
  const { email, otp } = c.get("validated") as z.infer<typeof vVerifyOtp>;
  const { deps } = c.var;

  const { resetToken } = await verifyOtp(deps.db, email, otp);

  return c.json({ resetToken }, 200);
};

export const handleResetPassword: AppHandler = async (c) => {
  const { resetToken, newPassword } = c.get("validated") as z.infer<typeof vResetPassword>;
  const { deps } = c.var;

  await resetPassword(deps.db, resetToken, newPassword);

  return c.body(null, 204);
};
