import { Hono } from "hono";
import type { AppBindings } from "../types/app.types.js";
import { rateLimiter } from "../middlewares/rate-limiter.js";
import { sessionMiddleware } from "../middlewares/session.js";
import { requireCsrf } from "../middlewares/require-csrf.js";
import { validateReq } from "../validations/validate-req.js";
import {
  vForgotPassword,
  vLogin,
  vResetPassword,
  vVerifyOtp,
} from "../validations/schemas/auth/auth-schemas.js";
import {
  handleForgotPassword,
  handleLogin,
  handleLogout,
  handleMe,
  handleResetPassword,
  handleVerifyOtp,
} from "../handlers/auth-handlers.js";

export const authRouter = new Hono<AppBindings>();

// Public — rate limited tightly
authRouter.post("/login", rateLimiter(10), validateReq("json", vLogin), handleLogin);
authRouter.post("/forgot-password", rateLimiter(5), validateReq("json", vForgotPassword), handleForgotPassword);
authRouter.post("/verify-otp", rateLimiter(10), validateReq("json", vVerifyOtp), handleVerifyOtp);
authRouter.post("/reset-password", rateLimiter(10), validateReq("json", vResetPassword), handleResetPassword);

// Protected
authRouter.get("/me", sessionMiddleware, handleMe);
authRouter.post("/logout", sessionMiddleware, requireCsrf, handleLogout);
