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
  // RateLimit-Remaining is specified as a whole-number count of requests,
  // not fractional tokens - floor it here, at the presentation layer, so
  // the underlying result (result.remaining) keeps its real precision for
  // any code that reads it directly.
  const remaining = Math.floor(result.remaining ?? 0);

  const headers: Record<string, string>
    = style === "draft-7"
      ? {
          RateLimit: `limit=${limit}, remaining=${
            remaining ?? 0
          }, reset=${result.resetSeconds}`,
        }
      : {
          "RateLimit-Limit": String(limit),
          "RateLimit-Remaining": String(remaining),
          "RateLimit-Reset": String(result.resetSeconds),
        };

  if (result.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}
