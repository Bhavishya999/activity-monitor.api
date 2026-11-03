import { eq } from "drizzle-orm";
import { schema, type Db } from "../../database/client.js";

export async function readSetting(db: Db, key: string): Promise<unknown> {
  const rows = await db.select({ value: schema.setting.value }).from(schema.setting).where(eq(schema.setting.key, key));
  return rows[0]?.value ?? null;
}
