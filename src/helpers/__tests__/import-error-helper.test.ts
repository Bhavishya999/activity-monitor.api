import { describe, expect, it } from "vitest";
import { GitHubHttpError, RateLimitError } from "../../services/github/index.js";
import { classifyImportError } from "../import-error-helper.js";
import { stripNul } from "../text-sanitize-helper.js";

describe("classifyImportError", () => {
  it("parks on rate limits", () => {
    const resetAt = new Date(Date.now() + 1000);
    expect(classifyImportError(new RateLimitError(resetAt))).toEqual({ kind: "rate-limit", resetAt });
  });
  it.each([404, 409, 410, 422, 451])("treats %i as permanent so it is not retried forever", (status) => {
    expect(classifyImportError(new GitHubHttpError(status, "x")).kind).toBe("permanent");
  });
  it.each([500, 502, 503])("retries %i", (status) => {
    expect(classifyImportError(new GitHubHttpError(status, "x")).kind).toBe("transient");
  });
  it("retries unknown errors such as network failures", () => {
    expect(classifyImportError(new Error("ECONNRESET")).kind).toBe("transient");
  });
});

describe("stripNul", () => {
  it("removes NUL bytes only", () => expect(stripNul("a\u0000b")).toBe("ab"));
  it("leaves clean text untouched", () => expect(stripNul("fix: ünïcode ✓")).toBe("fix: ünïcode ✓"));
});
