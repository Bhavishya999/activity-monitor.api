import { factory } from "../factory.js";
import { getRepository, listRepositories } from "../helpers/repository-helper.js";
import { vFilterQuerySchema, vIdParamSchema, vRepositoryListQuerySchema } from "../validations/schemas/analytics/analytics-schemas.js";
import { validateReq } from "../validations/validate-req.js";

export const handleListRepositories = factory.createHandlers(validateReq("query", vRepositoryListQuerySchema), async (c) => {
  return c.json(await listRepositories(c.get("deps"), c.req.valid("query")));
});

export const handleGetRepository = factory.createHandlers(
  validateReq("param", vIdParamSchema), validateReq("query", vFilterQuerySchema),
  async (c) => c.json(await getRepository(c.get("deps"), c.req.valid("param").id, c.req.valid("query"))),
);
