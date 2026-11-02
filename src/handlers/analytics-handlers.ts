import { factory } from "../factory.js";
import { getBreakdownReport, getOverview } from "../helpers/analytics-helper.js";
import { vBreakdownQuerySchema, vOverviewQuerySchema } from "../validations/schemas/analytics/analytics-schemas.js";
import { validateReq } from "../validations/validate-req.js";

export const handleGetOverview = factory.createHandlers(validateReq("query", vOverviewQuerySchema), async (c) => {
  return c.json(await getOverview(c.get("deps"), c.req.valid("query")));
});

export const handleGetBreakdown = factory.createHandlers(validateReq("query", vBreakdownQuerySchema), async (c) => {
  return c.json(await getBreakdownReport(c.get("deps"), c.req.valid("query")));
});
