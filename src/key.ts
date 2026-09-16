/**
 * Builds the Redis key for a given rule + algorithm + identifier.
 * The identifier is always hashed before being stored, so raw IPs,
 * emails, or user IDs never sit in Redis in plain text.
 *
 * Uses the Web Crypto API (`crypto.subtle`) instead of Node's
 * `node:crypto`, since Node's module doesn't exist on edge runtimes
 * like Cloudflare Workers - Web Crypto works identically everywhere.
 */
export async function buildKey(
  ruleName: string,
  algorithm: string,
  identifier: string,
): Promise<string> {
  const hashed = await hashIdentifier(identifier);
  return `ratelimit:${ruleName}:${algorithm}:${hashed}`;
}

/** SHA-256 hashes a string and returns it as lowercase hex. */
async function hashIdentifier(identifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(identifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
