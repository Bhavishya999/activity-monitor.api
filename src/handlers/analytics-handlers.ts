import { factory } from "../factory.js";
import { getOverview } from "../helpers/analytics-helper.js";
import { vOverviewQuerySchema } from "../validations/schemas/analytics/analytics-schemas.js";
import { validateReq } from "../validations/validate-req.js";

export const handleGetOverview = factory.createHandlers(validateReq("query", vOverviewQuerySchema), async (c) => {
  return c.json(await getOverview(c.get("deps"), c.req.valid("query")));
});
