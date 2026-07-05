import type { NextFunction, Request, Response } from "express";

const AUTH_HEADER = "authorization";
const API_KEY_HEADER = "x-api-key";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey =
    process.env.INTERNAL_API_KEY ?? process.env.SHADOW_TRADER_API_KEY;

  if (!configuredKey) {
    return next();
  }

  const headerValue = req.header(AUTH_HEADER) ?? "";
  const expectedValue = `Bearer ${configuredKey}`;
  const apiKeyValue = req.header(API_KEY_HEADER) ?? "";

  if (headerValue === expectedValue || apiKeyValue === configuredKey) {
    return next();
  }

  return res.status(401).json({
    error: "UNAUTHORIZED",
    message: "A valid API key is required.",
  });
}
