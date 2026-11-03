import {
  getCommits,
  getDeveloperDetail,
  getDevelopers,
  getOverview,
  getRepositories,
  getRepositoryDetail,
} from "../helpers/analytics-helper.js";
import type { AppHandler } from "../factory.js";
import type { z } from "zod";
import type {
  vCommitsQuery,
  vDevelopersQuery,
  vOverviewQuery,
  vRepositoriesQuery,
} from "../validations/schemas/analytics/analytics-schemas.js";

export const handleGetOverview: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vOverviewQuery>;
  const result = await getOverview(c.var.deps.db, q);
  return c.json(result, 200);
};

export const handleListDevelopers: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vDevelopersQuery>;
  const result = await getDevelopers(c.var.deps.db, q);
  return c.json(result, 200);
};

export const handleGetDeveloper: AppHandler = async (c) => {
  const id = Number(c.req.param("id"));
  const q = c.get("validated") as z.infer<typeof vOverviewQuery>;
  const result = await getDeveloperDetail(c.var.deps.db, id, q);
  return c.json(result, 200);
};

export const handleListRepositories: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vRepositoriesQuery>;
  const result = await getRepositories(c.var.deps.db, q);
  return c.json(result, 200);
};

export const handleGetRepository: AppHandler = async (c) => {
  const id = Number(c.req.param("id"));
  const q = c.get("validated") as z.infer<typeof vOverviewQuery>;
  const result = await getRepositoryDetail(c.var.deps.db, id, q);
  return c.json(result, 200);
};

export const handleListCommits: AppHandler = async (c) => {
  const q = c.get("validated") as z.infer<typeof vCommitsQuery>;
  const result = await getCommits(c.var.deps.db, q);
  return c.json(result, 200);
};
