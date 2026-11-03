export type SendOptions = {
  singletonKey?: string; retryLimit?: number; retryDelay?: number; retryBackoff?: boolean; startAfter?: Date;
};

import type { Db } from "../database/client.js";

export type Queue = { send(name: string, data: object, options?: SendOptions): Promise<string | null> };
export type AppDeps = { db: Db; queue: Queue; webhookSecret: string; maxWebhookBodyBytes?: number };

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "DEVELOPER";
};

export type AppVariables = {
  deps: AppDeps;
  requestId: string;
  user?: SessionUser;
  sessionCsrfToken?: string;
  // Set by validateReq middleware; cast to the specific schema type in each handler.
  validated?: unknown;
};
export type AppBindings = { Variables: AppVariables };
