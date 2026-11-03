import { listGithubAccounts } from "../services/database/github-accounts-db-service.js";
import type { AppHandler } from "../factory.js";

export const handleListGithubAccounts: AppHandler = async (c) => {
  const rows = await listGithubAccounts(c.var.deps.db);

  const accounts = rows.map((r) => ({
    installationId: r.installationId,
    status: r.status,
    repositorySelection: r.repositorySelection,
    account: {
      id: r.accountId,
      login: r.login,
      type: r.type,
      avatarUrl: r.avatarUrl,
      htmlUrl: r.htmlUrl,
    },
    repoCount: r.repoCount,
    activeRepoCount: r.activeRepoCount,
    lastSyncedAt: r.lastSyncedAt instanceof Date ? r.lastSyncedAt.toISOString() : null,
  }));

  return c.json({ accounts }, 200);
};
