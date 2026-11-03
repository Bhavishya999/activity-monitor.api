import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { CSRF_HEADER } from "./constants/roles.js";
import { APP_MESSAGES } from "./constants/app-messages.js";
import { BaseException } from "./exceptions/base-exception.js";
import { analyticsRouter } from "./routes/analytics-router.js";
import { commitRouter } from "./routes/commit-router.js";
import { developerRouter } from "./routes/developer-router.js";
import { repositoryRouter } from "./routes/repository-router.js";
import { teamRouter } from "./routes/team-router.js";
import { authRouter } from "./routes/auth-router.js";
import { metaRouter } from "./routes/meta-router.js";
import { healthRouter } from "./routes/health-router.js";
import { webhookRouter } from "./routes/webhook-router.js";
import type { AppBindings, AppDeps } from "./types/app.types.js";
import { logger } from "./utils/pino-logger.js";
import { errorBody } from "./utils/resp-utils.js";

export type { AppDeps, Queue } from "./types/app.types.js";

export function createApp(deps: AppDeps): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.use("*", secureHeaders());
  if (deps.auth.corsOrigins.length > 0) {
    app.use("*", cors({ origin: [...deps.auth.corsOrigins], credentials: true, allowHeaders: ["content-type", CSRF_HEADER], allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], maxAge: 600 }));
  }
  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("deps", deps);
    c.set("requestId", requestId);
    c.set("user", null);
    c.set("csrfToken", null);
    c.header("x-request-id", requestId);
    const started = Date.now();
    await next();
    logger.info({ requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started }, "request");
  });

  app.route("/", healthRouter);
  app.route("/api/v1/webhooks", webhookRouter);
  app.route("/api/v1/auth", authRouter);
  app.route("/api/v1/analytics", analyticsRouter);
  app.route("/api/v1/developers", developerRouter);
  app.route("/api/v1/repositories", repositoryRouter);
  app.route("/api/v1/commits", commitRouter);
  app.route("/api/v1/teams", teamRouter);
  app.route("/api/v1/meta", metaRouter);

  app.onError((err, c) => {
    const requestId = c.get("requestId");
    if (err instanceof BaseException) return c.json(errorBody(err.message, requestId), err.status);
    logger.error({ requestId, err }, "unhandled error");
    return c.json(errorBody(APP_MESSAGES.INTERNAL, requestId), 500);
  });

  return app;
}
