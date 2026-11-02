import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGitHubClient, RateLimitError } from "../src/services/github/index.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function client(handler: (url: URL, init: RequestInit) => Response) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const auth = new Headers(init.headers).get("authorization") ?? (input instanceof Request ? input.headers.get("authorization") : null);
    calls.push({ url: url.pathname, auth });
    return handler(url, init);
  }) as typeof fetch;
  return { gh: createGitHubClient({ appId: "123", privateKey, baseUrl: "https://api.test", fetch: fetchFn }), calls };
}

describe("GitHub App authentication", () => {
  it("mints a per-installation token and uses it for that installation's calls", async () => {
    const { gh, calls } = client((url) => {
      if (url.pathname === "/app/installations/42/access_tokens") return json({ token: "ghs_inst42", expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: {}, repository_selection: "all" }, 201);
      if (url.pathname === "/installation/repositories") return json({ total_count: 1, repositories: [{ id: 1, name: "r", full_name: "o/r", private: true, archived: false, default_branch: "main", owner: { id: 9, login: "o", type: "Organization" } }] }, 200, { link: '<https://api.test/x?page=2>; rel="next"', "x-ratelimit-remaining": "4999" });
      return json({}, 404);
    });
    const page = await gh.listRepositories(42, 1);
    expect(page.items[0]!.fullName).toBe("o/r");
    expect(page.hasNext).toBe(true);
    expect(page.rateLimit.remaining).toBe(4999);
    const tokenCall = calls.find((c) => c.url.endsWith("/access_tokens"))!;
    expect(tokenCall.auth).toMatch(/^bearer ey/i); // app JWT, never the private key
    expect(calls.find((c) => c.url === "/installation/repositories")!.auth).toBe("token ghs_inst42");
  });

  it("maps secondary/primary rate limits to RateLimitError with the reset time", async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    const { gh } = client((url) => {
      if (url.pathname.endsWith("/access_tokens")) return json({ token: "t", expires_at: new Date(Date.now() + 3600_000).toISOString() }, 201);
      return json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) });
    });
    const err = await gh.listBranches(1, "o/r", 1).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.resetAt.getTime()).toBe(reset * 1000);
  });
});
