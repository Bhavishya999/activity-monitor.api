import { factory } from "../factory.js";
import { searchCommits } from "../helpers/commit-helper.js";
import { vCommitListQuerySchema } from "../validations/schemas/analytics/analytics-schemas.js";
import { validateReq } from "../validations/validate-req.js";

export const handleListCommits = factory.createHandlers(validateReq("query", vCommitListQuerySchema), async (c) => {
  return c.json(await searchCommits(c.get("deps"), c.req.valid("query")));
});
