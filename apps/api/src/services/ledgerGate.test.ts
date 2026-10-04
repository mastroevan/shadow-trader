import assert from "node:assert/strict";
import test from "node:test";
import {
  checkLedgerApproval,
  toLedgerRiskAssessment,
  toLedgerThesis,
  type LedgerConfig,
  type LedgerThesisInput,
} from "./ledgerGate";

const config: LedgerConfig = { url: "http://ledger.test", timeoutMs: 1000, username: "agent", password: "" };

const entry: LedgerThesisInput = {
  symbol: "btc-usd",
  direction: "BEARISH",
  thesis: "Rejection at range high",
  confidenceScore: 0.876,
  stopLoss: 64000,
  maxDollarRisk: 100,
  riskRewardRatio: 2.5,
  positionSize: 3,
  gateReasons: [],
};

type Call = { url: string; method: string; body?: unknown; authorization?: string };

function fakeFetch(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string> | undefined;
    calls.push({
      url,
      method,
      body: typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body,
      authorization: headers?.Authorization,
    });
    const key = `${method} ${url}`;
    if (!(key in responses)) return new Response("not found", { status: 404 });
    const value = responses[key];
    return value instanceof Response ? value : Response.json(value);
  }) as typeof fetch;

  return { fetchImpl, calls };
}

test("gate is off when the ledger is not configured", async () => {
  const { fetchImpl, calls } = fakeFetch({});
  const decision = await checkLedgerApproval(entry, null, fetchImpl);

  assert.deepEqual(decision, { status: "DISABLED" });
  assert.equal(calls.length, 0);
});

test("first attempt records thesis and risk assessment, then waits for approval", async () => {
  const { fetchImpl, calls } = fakeFetch({
    "POST http://ledger.test/ledger/TradeTheses": { ID: "t-1" },
    "POST http://ledger.test/ledger/RiskAssessments": { ID: "r-1" },
  });
  const decision = await checkLedgerApproval(entry, config, fetchImpl);

  assert.deepEqual(decision, { status: "AWAITING_APPROVAL", ledgerThesisId: "t-1" });
  assert.deepEqual(calls.map((call) => call.method + " " + call.url), [
    "POST http://ledger.test/ledger/TradeTheses",
    "POST http://ledger.test/ledger/RiskAssessments",
  ]);
  assert.equal((calls[1].body as { thesis_ID: string }).thesis_ID, "t-1");
  assert.equal(calls[0].authorization, `Basic ${Buffer.from("agent:").toString("base64")}`);
});

test("approved thesis lets the trade through", async () => {
  const { fetchImpl } = fakeFetch({
    "GET http://ledger.test/ledger/isApproved(thesis=t-1)": { value: true },
  });
  const decision = await checkLedgerApproval({ ...entry, ledgerThesisId: "t-1" }, config, fetchImpl);

  assert.deepEqual(decision, { status: "APPROVED", ledgerThesisId: "t-1" });
});

test("unapproved or rejected thesis keeps waiting", async () => {
  const { fetchImpl } = fakeFetch({
    "GET http://ledger.test/ledger/isApproved(thesis=t-1)": { value: false },
  });
  const decision = await checkLedgerApproval({ ...entry, ledgerThesisId: "t-1" }, config, fetchImpl);

  assert.deepEqual(decision, { status: "AWAITING_APPROVAL", ledgerThesisId: "t-1" });
});

test("ledger errors fail closed", async () => {
  const { fetchImpl } = fakeFetch({
    "GET http://ledger.test/ledger/isApproved(thesis=t-1)": new Response("boom", { status: 500 }),
  });
  const decision = await checkLedgerApproval({ ...entry, ledgerThesisId: "t-1" }, config, fetchImpl);

  assert.equal(decision.status, "UNAVAILABLE");
});

test("unreachable ledger fails closed", async () => {
  const fetchImpl = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const decision = await checkLedgerApproval(entry, config, fetchImpl);

  assert.equal(decision.status, "UNAVAILABLE");
});

test("uses an XSUAA client-credentials token when configured", async () => {
  const { fetchImpl, calls } = fakeFetch({
    "POST https://uaa.test/oauth/token": { access_token: "abc" },
    "GET http://ledger.test/ledger/isApproved(thesis=t-1)": { value: true },
  });
  const oauthConfig: LedgerConfig = {
    url: "http://ledger.test",
    timeoutMs: 1000,
    tokenUrl: "https://uaa.test/oauth/token",
    clientId: "id",
    clientSecret: "secret",
  };
  await checkLedgerApproval({ ...entry, ledgerThesisId: "t-1" }, oauthConfig, fetchImpl);

  assert.equal(calls[0].body, "grant_type=client_credentials");
  assert.equal(calls[1].authorization, "Bearer abc");
});

test("maps entries onto the ledger schema", () => {
  assert.deepEqual(toLedgerThesis(entry), {
    ticker: "BTC-USD",
    direction: "short",
    thesis: "Rejection at range high",
    confidence: 0.88,
  });
  assert.equal(toLedgerThesis({ ...entry, direction: "LONG", thesis: "  " }).thesis, "BTC-USD long");
  assert.equal(toLedgerThesis({ ...entry, confidenceScore: 1.4 }).confidence, 1);
  assert.deepEqual(toLedgerRiskAssessment("t-1", entry), {
    thesis_ID: "t-1",
    maxLossUSD: 100,
    stopLoss: 64000,
    notes: "R:R 2.50; size 3",
  });
});
