import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const AUTH_HEADER = "authorization";
const API_KEY_HEADER = "x-api-key";
const BEARER_PREFIX = "Bearer ";

// Hash both sides so timingSafeEqual always compares equal-length buffers and
// the comparison time doesn't leak the configured key's length or contents.
function safeEqual(a: string, b: string) {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey =
    process.env.INTERNAL_API_KEY ?? process.env.SHADOW_TRADER_API_KEY;

  if (!configuredKey) {
    // Auth is a no-op only for local development; never serve production unauthenticated.
    if (process.env.NODE_ENV === "production") {
      return res.status(500).json({
        error: "MISSING_INTERNAL_API_KEY",
        message: "Server is missing INTERNAL_API_KEY.",
      });
    }
    return next();
  }

  const headerValue = req.header(AUTH_HEADER) ?? "";
  const bearerValue = headerValue.startsWith(BEARER_PREFIX)
    ? headerValue.slice(BEARER_PREFIX.length)
    : "";
  const apiKeyValue = req.header(API_KEY_HEADER) ?? "";

  if (
    (bearerValue && safeEqual(bearerValue, configuredKey)) ||
    (apiKeyValue && safeEqual(apiKeyValue, configuredKey))
  ) {
    return next();
  }

  return res.status(401).json({
    error: "UNAUTHORIZED",
    message: "A valid API key is required.",
  });
}
