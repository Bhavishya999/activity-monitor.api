import { randomToken, sha256Hex } from "../utils/crypto-utils.js";
import { APP_MESSAGES } from "../constants/app-messages.js";
import type { Role } from "../constants/roles.js";
import { NotFoundException } from "../exceptions/not-found-exception.js";
import { deleteSession, findActiveSession, findOrCreateDevUser, insertSession, type SessionWithUser } from "../services/database/session-db-service.js";
import type { AppDeps } from "../types/app.types.js";

export type NewSession = { token: string; csrfToken: string; expiresAt: Date };

/** Development-only sign-in used until Zoho OIDC lands. The route 404s unless explicitly enabled. */
export async function startDevSession(deps: AppDeps, email: string, role: Role): Promise<NewSession> {
  if (!deps.auth.devAuthEnabled) throw new NotFoundException(APP_MESSAGES.DEV_AUTH_DISABLED);
  const user = await findOrCreateDevUser(deps.db, email.toLowerCase(), role);
  const token = randomToken();
  const csrfToken = randomToken(16);
  const expiresAt = new Date(Date.now() + deps.auth.sessionTtlMs);
  await insertSession(deps.db, { id: sha256Hex(token), userId: user.id, csrfToken, expiresAt });
  return { token, csrfToken, expiresAt };
}

export async function resolveSession(deps: AppDeps, token: string): Promise<SessionWithUser | null> {
  return findActiveSession(deps.db, sha256Hex(token));
}

export async function endSession(deps: AppDeps, token: string): Promise<void> {
  await deleteSession(deps.db, sha256Hex(token));
}
