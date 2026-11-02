import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { BadRequestException } from "../exceptions/bad-request-exception.js";

type Target = "query" | "json" | "param";

/** Validates a request part; failures become a 400 through the global error handler. */
// Return type is intentionally inferred: it carries the schema type through to c.req.valid() in each handler.
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function validateReq<S extends z.ZodType, T extends Target>(target: T, schema: S) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((i) => `${i.path.join(".") || target}: ${i.message}`).join("; "));
    }
  });
}
