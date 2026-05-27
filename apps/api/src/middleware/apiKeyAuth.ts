import type { NextFunction, Request, Response } from "express";

const AUTH_HEADER = "authorization";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.SHADOW_TRADER_API_KEY;

  if (!configuredKey) {
    return next();
  }

  const headerValue = req.header(AUTH_HEADER) ?? "";
  const expectedValue = `Bearer ${configuredKey}`;

  if (headerValue === expectedValue) {
    return next();
  }

  return res.status(401).json({
    error: "UNAUTHORIZED",
    message: "A valid API key is required.",
  });
}
