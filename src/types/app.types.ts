export type SendOptions = {
  singletonKey?: string; retryLimit?: number; retryDelay?: number; retryBackoff?: boolean; startAfter?: Date;
};

import type { Db } from "../database/client.js";

export type Queue = { send(name: string, data: object, options?: SendOptions): Promise<string | null> };
export type AppDeps = { db: Db; queue: Queue; webhookSecret: string; maxWebhookBodyBytes?: number };
export type AppVariables = { deps: AppDeps; requestId: string };
export type AppBindings = { Variables: AppVariables };
