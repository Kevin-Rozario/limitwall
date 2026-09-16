import type { RateLimitResult } from "./types";

export type HeaderStyle = "draft-6" | "draft-7";

/**
 * Builds response headers for a rate limit result, following one of the
 * two IETF RateLimit header drafts, plus the standard HTTP `Retry-After`
 * header when the result carries a `retryAfterSeconds` (leaky bucket).
 *
 * draft-6 uses three separate `RateLimit-*` headers.
 * draft-7 combines them into a single `RateLimit` header.
 */
export function buildRateLimitHeaders(
  limit: number,
  result: RateLimitResult,
  style: HeaderStyle = "draft-6",
): Record<string, string> {
  const headers: Record<string, string>
    = style === "draft-7"
      ? {
          RateLimit: `limit=${limit}, remaining=${
            result.remaining ?? 0
          }, reset=${result.resetSeconds}`,
        }
      : {
          "RateLimit-Limit": String(limit),
          "RateLimit-Remaining": String(result.remaining ?? 0),
          "RateLimit-Reset": String(result.resetSeconds),
        };

  if (result.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}
