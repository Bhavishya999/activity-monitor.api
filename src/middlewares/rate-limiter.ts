import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { APP_MESSAGES } from "../constants/app-messages.js";
import { TooManyRequestsException } from "../exceptions/too-many-requests-exception.js";
import type { AppBindings } from "../types/app.types.js";

type Bucket = { count: number; resetAt: number };

/** Fixed-window limiter per client IP. In-memory: fine for one API instance; move to Postgres/Redis if scaled out. */
export function rateLimiter(limitPerMinute: number): MiddlewareHandler<AppBindings> {
  const buckets = new Map<string, Bucket>();
  return createMiddleware<AppBindings>(async (c, next) => {
    const now = Date.now();
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + 60_000 }; buckets.set(ip, bucket); }
    bucket.count += 1;
    if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (bucket.count > limitPerMinute) throw new TooManyRequestsException(APP_MESSAGES.RATE_LIMITED);
    await next();
  });
}
