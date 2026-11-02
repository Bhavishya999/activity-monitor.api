import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import { BadRequestException } from "../exceptions/bad-request-exception.js";
import type { AppBindings } from "../types/app.types.js";

type Source = "query" | "json";

/** Validates query or JSON body against a schema; handlers read the result with getValidated(). */
export function validateReq<S extends z.ZodType>(source: Source, schema: S): MiddlewareHandler<AppBindings & { Variables: { validated: z.infer<S> } }> {
  return createMiddleware<AppBindings & { Variables: { validated: z.infer<S> } }>(async (c, next) => {
    const input: unknown = source === "query" ? c.req.query() : await c.req.json().catch(() => undefined);
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    c.set("validated", parsed.data);
    await next();
  });
}
