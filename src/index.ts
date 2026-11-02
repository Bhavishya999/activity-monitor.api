import { serve } from "@hono/node-server";
import { PgBoss } from "pg-boss";
import { createDb } from "./database/client.js";
import { JOBS } from "./constants/jobs.js";
import { createApp } from "./app.js";
import { appConfig } from "./config/app-config.js";
import { dbConfig } from "./config/db-config.js";
import { githubConfig } from "./config/github-config.js";
import { logger } from "./utils/pino-logger.js";

const { db } = createDb(dbConfig.url, dbConfig.poolMax);
const boss = new PgBoss(dbConfig.url);
boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
await boss.start();
for (const queueName of Object.values(JOBS)) await boss.createQueue(queueName);

const app = createApp({
  db,
  queue: { send: (name, data, options) => boss.send(name, data, options) },
  webhookSecret: githubConfig.webhookSecret,
  maxWebhookBodyBytes: githubConfig.maxWebhookBodyBytes,
});
serve({ fetch: app.fetch, port: appConfig.port });
logger.info({ port: appConfig.port }, "api listening");
