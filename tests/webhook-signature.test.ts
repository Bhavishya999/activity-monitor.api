import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/services/github/index.js";

const secret = "s3cret-s3cret-s3cret";
const sign = (b: string, s = secret) => "sha256=" + createHmac("sha256", s).update(b).digest("hex");

describe("verifyWebhookSignature", () => {
  const body = '{"a":1}';
  it("accepts a valid signature", () => expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true));
  it("rejects a tampered body (exact raw bytes matter)", () => expect(verifyWebhookSignature('{"a": 1}', sign(body), secret)).toBe(false));
  it("rejects wrong secret", () => expect(verifyWebhookSignature(body, sign(body, "other-other-other-x"), secret)).toBe(false));
  it("rejects missing / malformed / sha1 headers", () => {
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=", secret)).toBe(false);
  });
  it("rejects when the server secret is empty", () => expect(verifyWebhookSignature(body, sign(body, ""), "")).toBe(false));
});
