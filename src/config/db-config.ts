import { requireEnv } from "../env.js";

export const dbConfig = { url: requireEnv("DATABASE_URL"), poolMax: 10 } as const;
