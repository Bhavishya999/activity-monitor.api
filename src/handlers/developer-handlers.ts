import { factory } from "../factory.js";
import { getDeveloper, listDevelopers } from "../helpers/developer-helper.js";
import { vDeveloperListQuerySchema, vFilterQuerySchema, vIdParamSchema } from "../validations/schemas/analytics/analytics-schemas.js";
import { validateReq } from "../validations/validate-req.js";

export const handleListDevelopers = factory.createHandlers(validateReq("query", vDeveloperListQuerySchema), async (c) => {
  return c.json(await listDevelopers(c.get("deps"), c.req.valid("query")));
});

export const handleGetDeveloper = factory.createHandlers(
  validateReq("param", vIdParamSchema), validateReq("query", vFilterQuerySchema),
  async (c) => c.json(await getDeveloper(c.get("deps"), c.req.valid("param").id, c.req.valid("query"))),
);
