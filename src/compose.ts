import { createMiddleware } from "hono/factory";

import type { RateLimitResult } from "./types";

import { applyRateLimitResult, type RateLimiterConfig } from "./middleware";
import { runCheck } from "./run-check";

interface EvaluatedRule {
  config: RateLimiterConfig;
  result: RateLimitResult;
}

/** Picks the allowed rule whose remaining is lowest; ties keep the earlier rule. */
function pickAllowHeaders(evaluated: EvaluatedRule[]): EvaluatedRule {
  const withRemaining = evaluated.filter(
    rule => rule.result.remaining !== undefined,
  );

  if (withRemaining.length === 0)
    return evaluated[evaluated.length - 1];

  return withRemaining.reduce((best, current) => {
    if ((current.result.remaining as number) < (best.result.remaining as number))
      return current;
    return best;
  });
}

/**
 * Combines several rate-limit rules into one middleware.
 * Rules run in array order; the first reject or fail-closed error wins.
 */
export function combineRules(rules: RateLimiterConfig[]) {
  if (rules.length === 0)
    throw new Error("combineRules requires at least one rule");

  return createMiddleware(async (c, next) => {
    const allowed: EvaluatedRule[] = [];

    for (const rule of rules) {
      const identifier = rule.identifier(c);
      let result: RateLimitResult;
      try {
        result = await runCheck(rule, identifier);
      }
      catch {
        if (rule.onError === "fail-open")
          continue;

        c.status(503);
        return c.json({ error: "Rate limiter unavailable" });
      }

      if (!result.allowed)
        return applyRateLimitResult(c, next, rule, result);

      allowed.push({ config: rule, result });
    }

    if (allowed.length === 0) {
      await next();
      return;
    }

    const chosen = pickAllowHeaders(allowed);
    return applyRateLimitResult(c, next, chosen.config, chosen.result);
  });
}
