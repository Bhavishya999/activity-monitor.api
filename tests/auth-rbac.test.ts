import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { requireRole } from "../src/middlewares/is-authorized.js";
import { ROLES } from "../src/constants/roles.js";
import type { AppBindings, AuthOptions } from "../src/types/app.types.js";
import { reset, testAuth, testDb } from "./helpers.js";

const { db } = testDb();
const make = (auth: AuthOptions) => createApp({ db, webhookSecret: "x".repeat(24), queue: { send: async () => "id" }, auth });
const app = make(testAuth);

async function login(a = app): Promise<{ cookie: string; csrf: string }> {
  const res = await a.request("/api/v1/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "dev@example.test" }) });
  expect(res.status).toBe(200);
  return { cookie: (res.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "", csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
}

beforeEach(async () => { await reset(db); });

describe("authentication", () => {
  it.each(["/analytics/overview", "/developers", "/repositories", "/commits", "/auth/me"])("%s requires a session", async (path) => {
    expect((await app.request(`/api/v1${path}`)).status).toBe(401);
  });

  it("does not expose dev login unless explicitly enabled", async () => {
    const off = make({ ...testAuth, devAuthEnabled: false });
    const res = await off.request("/api/v1/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@example.test" }) });
    expect(res.status).toBe(404);
  });

  it("issues an HttpOnly SameSite cookie and never returns the session token in the body", async () => {
    const res = await app.request("/api/v1/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "dev@example.test" }) });
    const setCookie = res.headers.getSetCookie()[0] ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const token = setCookie.split(";")[0]?.split("=")[1] ?? "";
    expect(JSON.stringify(await res.json())).not.toContain(token);
  });

  it("returns the current user, rejects forged cookies, and expires sessions", async () => {
    const { cookie } = await login();
    const me = await app.request("/api/v1/auth/me", { headers: { cookie } });
    expect(((await me.json()) as { user: { role: string } }).user.role).toBe("DEVELOPER");
    expect((await app.request("/api/v1/auth/me", { headers: { cookie: "gam_session=forged" } })).status).toBe(401);
    const short = make({ ...testAuth, sessionTtlMs: -1000 });
    const expired = await login(short);
    expect((await short.request("/api/v1/auth/me", { headers: { cookie: expired.cookie } })).status).toBe(401);
  });

  it("requires the CSRF token to log out, then invalidates the session server-side", async () => {
    const { cookie, csrf } = await login();
    expect((await app.request("/api/v1/auth/logout", { method: "POST", headers: { cookie } })).status).toBe(403);
    expect((await app.request("/api/v1/auth/logout", { method: "POST", headers: { cookie, "x-csrf-token": csrf } })).status).toBe(200);
    expect((await app.request("/api/v1/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects a deactivated user's session", async () => {
    const { cookie } = await login();
    await db.update((await import("../src/database/client.js")).schema.appUser).set({ active: false });
    expect((await app.request("/api/v1/auth/me", { headers: { cookie } })).status).toBe(401);
  });
});

describe("role gate", () => {
  const gated = new Hono<AppBindings>();
  let role: "DEVELOPER" | "ADMIN" | "SUPER_ADMIN" = "DEVELOPER";
  gated.use("*", async (c, next) => { c.set("user", { id: 1, email: "x@example.test", name: null, role, employeeId: null }); await next(); });
  gated.get("/admin-only", requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), (c) => c.json({ ok: true }));
  gated.onError((err, c) => c.json({ error: err.message }, "status" in err && typeof err.status === "number" ? (err.status as 403) : 500));

  it.each([["DEVELOPER", 403], ["ADMIN", 200], ["SUPER_ADMIN", 200]] as const)("%s -> %i", async (r, status) => {
    role = r;
    expect((await gated.request("/admin-only")).status).toBe(status);
  });
});

describe("production safety", () => {
  it("refuses to boot with dev login enabled in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    await expect(import("../src/config/auth-config.js")).rejects.toThrow(/DEV_AUTH_ENABLED/);
    vi.unstubAllEnvs();
  });

  it("marks cookies Secure in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH_ENABLED", "false");
    const { authConfig } = await import("../src/config/auth-config.js");
    expect(authConfig.secureCookies).toBe(true);
    expect(authConfig.devAuthEnabled).toBe(false);
    vi.unstubAllEnvs();
  });
});
