// Human-approval gate backed by the SAP CAP ledger (`ledger/` at the repo root).
//
// A watchlist entry that passed the automated risk gate still cannot open a
// paper trade until a human Approver has recorded an approval in the ledger.
// The first attempt records the thesis + risk assessment and is refused; once
// someone calls the ledger's `decide` action, the next attempt goes through.
//
// If LEDGER_URL is unset the gate is off (local dev convenience, like
// requireApiKey). If it is set, any ledger failure blocks the trade.

export type LedgerConfig = {
  url: string;
  timeoutMs: number;
  // Basic auth, for the ledger's mocked users in development.
  username?: string;
  password?: string;
  // OAuth client credentials, for XSUAA in production.
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
};

export type LedgerThesisInput = {
  symbol: string;
  direction: string;
  thesis: string;
  confidenceScore?: number | null;
  stopLoss?: number | null;
  maxDollarRisk?: number | null;
  riskRewardRatio?: number | null;
  positionSize?: number | null;
  gateReasons?: string[];
};

export type LedgerDecision =
  | { status: "DISABLED" }
  | { status: "APPROVED"; ledgerThesisId: string }
  | { status: "AWAITING_APPROVAL"; ledgerThesisId: string }
  | { status: "UNAVAILABLE"; ledgerThesisId?: string; message: string };

type FetchFn = typeof fetch;

export const ledgerConfig: LedgerConfig | null = process.env.LEDGER_URL
  ? {
      url: process.env.LEDGER_URL.replace(/\/+$/, ""),
      timeoutMs: readNumber("LEDGER_TIMEOUT_MS", 5000),
      username: process.env.LEDGER_USERNAME,
      password: process.env.LEDGER_PASSWORD ?? "",
      tokenUrl: process.env.LEDGER_TOKEN_URL,
      clientId: process.env.LEDGER_CLIENT_ID,
      clientSecret: process.env.LEDGER_CLIENT_SECRET,
    }
  : null;

export async function checkLedgerApproval(
  entry: LedgerThesisInput & { ledgerThesisId?: string },
  config: LedgerConfig | null = ledgerConfig,
  fetchImpl: FetchFn = fetch
): Promise<LedgerDecision> {
  if (!config) return { status: "DISABLED" };

  const client = createLedgerClient(config, fetchImpl);
  let ledgerThesisId = entry.ledgerThesisId;

  try {
    if (!ledgerThesisId) {
      ledgerThesisId = await client.recordThesis(entry);
      return { status: "AWAITING_APPROVAL", ledgerThesisId };
    }

    return (await client.isApproved(ledgerThesisId))
      ? { status: "APPROVED", ledgerThesisId }
      : { status: "AWAITING_APPROVAL", ledgerThesisId };
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      ledgerThesisId,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createLedgerClient(config: LedgerConfig, fetchImpl: FetchFn = fetch) {
  async function authHeader(): Promise<string | undefined> {
    if (config.tokenUrl && config.clientId && config.clientSecret) {
      const response = await fetchImpl(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${base64(`${config.clientId}:${config.clientSecret}`)}`,
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) throw new Error(`Ledger token request failed: ${response.status}`);
      const { access_token } = (await response.json()) as { access_token: string };
      return `Bearer ${access_token}`;
    }

    if (config.username) return `Basic ${base64(`${config.username}:${config.password ?? ""}`)}`;

    return undefined;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const authorization = await authHeader();
    const response = await fetchImpl(`${config.url}/ledger${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Ledger ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
  }

  return {
    async recordThesis(entry: LedgerThesisInput): Promise<string> {
      const thesis = await request<{ ID: string }>("/TradeTheses", {
        method: "POST",
        body: JSON.stringify(toLedgerThesis(entry)),
      });
      await request("/RiskAssessments", {
        method: "POST",
        body: JSON.stringify(toLedgerRiskAssessment(thesis.ID, entry)),
      });
      return thesis.ID;
    },

    async isApproved(ledgerThesisId: string): Promise<boolean> {
      const { value } = await request<{ value: boolean }>(`/isApproved(thesis=${encodeURIComponent(ledgerThesisId)})`);
      return value === true;
    },
  };
}

export function toLedgerThesis(entry: LedgerThesisInput) {
  const direction = getDirection(entry.direction);

  return {
    ticker: entry.symbol.toUpperCase().slice(0, 12),
    direction,
    thesis: entry.thesis.trim() || `${entry.symbol.toUpperCase()} ${direction}`,
    confidence:
      typeof entry.confidenceScore === "number" && Number.isFinite(entry.confidenceScore)
        ? Math.round(Math.min(Math.max(entry.confidenceScore, 0), 1) * 100) / 100
        : null,
  };
}

export function toLedgerRiskAssessment(ledgerThesisId: string, entry: LedgerThesisInput) {
  const notes = [
    typeof entry.riskRewardRatio === "number" ? `R:R ${entry.riskRewardRatio.toFixed(2)}` : null,
    typeof entry.positionSize === "number" ? `size ${entry.positionSize}` : null,
    ...(entry.gateReasons ?? []),
  ].filter(Boolean).join("; ");

  return {
    thesis_ID: ledgerThesisId,
    maxLossUSD: positiveOrNull(entry.maxDollarRisk),
    stopLoss: positiveOrNull(entry.stopLoss),
    notes: notes.slice(0, 1000) || null,
  };
}

function positiveOrNull(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function getDirection(direction?: string | null): "long" | "short" {
  const normalized = direction?.toUpperCase() ?? "";

  return normalized.includes("BEAR") || normalized.includes("SHORT") ? "short" : "long";
}

function base64(value: string) {
  return Buffer.from(value).toString("base64");
}

function readNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) ? value : fallback;
}
