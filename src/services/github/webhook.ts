import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify X-Hub-Signature-256 against the exact raw request body. */
export function verifyWebhookSignature(rawBody: string | Buffer, header: string | undefined | null, secret: string): boolean {
  if (!header || !secret || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let given: Buffer;
  try { given = Buffer.from(header.slice(7), "hex"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
