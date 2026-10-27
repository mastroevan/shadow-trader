import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { requireApiKey } from "./apiKeyAuth";

const ORIGINAL_ENV = { ...process.env };

function run(headers: Record<string, string>) {
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const result: { status?: number; body?: unknown; nextCalled: boolean } = { nextCalled: false };
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    result.nextCalled = true;
  };

  requireApiKey(req, res, next);
  return result;
}

describe("requireApiKey", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a matching x-api-key header", () => {
    process.env.INTERNAL_API_KEY = "secret-key";
    assert.equal(run({ "x-api-key": "secret-key" }).nextCalled, true);
  });

  it("accepts a matching bearer token", () => {
    process.env.INTERNAL_API_KEY = "secret-key";
    assert.equal(run({ authorization: "Bearer secret-key" }).nextCalled, true);
  });

  it("rejects a wrong or missing key", () => {
    process.env.INTERNAL_API_KEY = "secret-key";
    assert.equal(run({ "x-api-key": "nope" }).status, 401);
    assert.equal(run({ authorization: "Bearer secret" }).status, 401);
    assert.equal(run({}).status, 401);
  });

  it("allows unauthenticated requests in development when no key is configured", () => {
    delete process.env.INTERNAL_API_KEY;
    delete process.env.SHADOW_TRADER_API_KEY;
    process.env.NODE_ENV = "development";
    assert.equal(run({}).nextCalled, true);
  });

  it("refuses requests in production when no key is configured", () => {
    delete process.env.INTERNAL_API_KEY;
    delete process.env.SHADOW_TRADER_API_KEY;
    process.env.NODE_ENV = "production";
    const result = run({});
    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 500);
  });
});
