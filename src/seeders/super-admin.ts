import bcrypt from "bcryptjs";
import { createDb } from "../database/client.js";
import { dbConfig } from "../config/db-config.js";
import { requireEnv } from "../env.js";
import { findUserByEmail, createUser } from "../services/database/auth-db-service.js";
import { logger } from "../utils/pino-logger.js";

const email = requireEnv("SUPER_ADMIN_EMAIL");
const password = requireEnv("SUPER_ADMIN_PASSWORD");

const { db } = createDb(dbConfig.url, dbConfig.poolMax);

const existing = await findUserByEmail(db, email);
if (existing) {
  logger.info({ email }, "SUPER_ADMIN already exists — skipping seed");
  process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);

await createUser(db, {
  email,
  name: "Super Admin",
  provider: "local",
  passwordHash,
  role: "SUPER_ADMIN",
});

logger.info({ email }, "SUPER_ADMIN created successfully");
process.exit(0);
