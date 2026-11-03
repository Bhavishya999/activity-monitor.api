import { readSetting } from "../services/database/setting-db-service.js";
import type { AppDeps } from "../types/app.types.js";

export const SETTING_SAMPLE_DATA = "sample_data";

export type AppMeta = { sample: boolean; timezone: string };

/** `sample` is true only when a developer seeded demo data; the UI then shows a permanent banner. */
export async function getAppMeta(deps: AppDeps): Promise<AppMeta> {
  const flag = await readSetting(deps.db, SETTING_SAMPLE_DATA);
  return { sample: flag === true, timezone: deps.auth.defaultTimezone };
}
