import type { Db } from "../database/client.js";
import type { Role } from "../constants/roles.js";

export type SendOptions = {
  singletonKey?: string; retryLimit?: number; retryDelay?: number; retryBackoff?: boolean; startAfter?: Date;
};

export type Queue = { send(name: string, data: object, options?: SendOptions): Promise<string | null> };

export type AuthOptions = {
  devAuthEnabled: boolean; // local development only; startup refuses it in production
  secureCookies: boolean;
  sessionTtlMs: number;
  defaultTimezone: string;
  corsOrigins: readonly string[]; // exact origins allowed to call the API with credentials; empty = same-origin only
};

export type AppDeps = { db: Db; queue: Queue; webhookSecret: string; auth: AuthOptions; maxWebhookBodyBytes?: number };

export type AuthUser = { id: number; email: string; name: string | null; role: Role; employeeId: number | null };

export type AppVariables = { deps: AppDeps; requestId: string; user: AuthUser | null; csrfToken: string | null };
export type AppBindings = { Variables: AppVariables };
