# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shadow Trader is a personal AI market research app: enter a ticker (stock or crypto), and the system fetches live quote/candle data, headlines, and technical signals, sends that evidence to an OpenAI/LangGraph agent, and turns the response into a structured trading thesis plus a watchlist action plan. Watchlist entries can progress through a paper-trading lifecycle (watch → triggered → paper trade → closed/ledger) gated by a risk-management module.

## Services (three apps, run independently)

- `apps/web` — Next.js 14 (App Router) frontend + NextAuth (GitHub OAuth) + a proxy API route.
- `apps/api` — Node/Express + TypeScript backend, Prisma 7 (`@prisma/adapter-pg`) over PostgreSQL.
- `apps/agent` — Python FastAPI microservice wrapping a LangGraph agent (`langchain_openai`).

Data flow: `web (Next.js UI)` → `web /api/backend/[...path]` proxy (adds `x-api-key`, requires NextAuth session) → `api (Express, port 3001)` → Finnhub / Yahoo / Coinbase for market data, and `agent (FastAPI, port 8000)` for the AI thesis → `api` persists everything to Postgres via Prisma and returns to `web`.

## Common commands

Install (per app — there is no root workspace tooling):

```bash
cd apps/web && npm install
cd apps/api && npm install
cd apps/agent && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

Run each service in its own terminal, in this order (agent, then api, then web):

```bash
cd apps/agent && source venv/bin/activate && uvicorn server:app --reload --port 8000
cd apps/api && npm run dev        # nodemon + tsx, watches src/
cd apps/web && npm run dev        # next dev
```

API (`apps/api`):

```bash
npm run build            # prisma generate && tsc
npm run test             # tsx --test "src/**/*.test.ts" — runs ALL *.test.ts under src
npx tsx --test src/services/tradeGatekeeper.test.ts   # run a single test file
npm run db:push          # prisma db push
npm run prisma:generate  # regenerate client into src/generated/prisma
npx prisma migrate dev   # create/apply a local migration
```

Tests use Node's built-in `node:test` + `node:assert/strict` (not Jest/Vitest). Test files sit next to the code they cover (`*.test.ts`), e.g. `src/utils/signals.test.ts`, `src/utils/symbols.test.ts`, `src/services/tradeGatekeeper.test.ts`.

Web (`apps/web`):

```bash
npm run build
npm run lint    # next lint
```

There is no web test suite currently.

Root-level (`package.json` at repo root):

```bash
npm run proof:e2e:btc -- --write   # scripts/e2e_btc_proof.mjs — full E2E proof against BTC/USD
npm run proof:e2e                  # scripts/e2e_proof.mjs
```

These proof scripts require all three services running locally (or `API_BASE_URL` pointed at a hosted deployment) and exercise the real flow: agent call → quote/candle fetch → watchlist save → paper trade open/close.

Env vars live in a single root `.env` (all three apps `dotenv.config()` up to `../../.env` from their own directory) plus `apps/web/.env.local` for web-only Next.js vars. Copy `.env.example` to get started; see it and `docs/deployment.md` for the full variable list and required-vs-optional split.

## API architecture (`apps/api/src`)

- `index.ts` — Express app wiring. `requireApiKey` middleware (`middleware/apiKeyAuth.ts`) guards every `/api/*` route via `x-api-key` or `Authorization: Bearer <key>`, checked against `INTERNAL_API_KEY`/`SHADOW_TRADER_API_KEY`; if neither is set, auth is a no-op (dev convenience). On boot it also starts `automationScheduler` and `startupScanner`.
- Routes (`routes/*.ts`) are thin — they parse/validate `req.body`, call a service, and shape the HTTP response. Business logic lives in `services/`.
- `services/setupAnalysis.ts` — the core orchestration for `POST /api/setups/analyze`: resolves the instrument, fetches a market snapshot, generates technical signals (`utils/signals.ts`), calls the Python agent, validates/normalizes the returned thesis, and persists a `ThesisRecord`. **If the agent call fails or times out, it falls back to `buildFallbackThesis` — a deterministic rule-based thesis** rather than erroring, so callers can distinguish `agentStatus: "AI_AGENT"` vs `"RULE_BASED_FALLBACK"` (see `agentFailure.reason`: `TIMEOUT`, `AGENT_UNREACHABLE`, `AGENT_CONFIG`, `AGENT_QUOTA`, `INVALID_AGENT_RESPONSE`, `AGENT_ERROR`).
- `services/watchlist.ts` — implements the paper-trading lifecycle as one Prisma model (`TradeLifecycleEntry`) reused for three "kinds" (`WATCHLIST`, `PAPER_TRADE`, `LEDGER`), each row storing its full state as `payloadJson`. Status transitions: `Watching → Triggered Review/Pending Confirmation → Triggered (paper trade) → closed (Ledger)`, or `Watching → Invalidated/Expired (Ledger)`. Moving between kinds is a delete+create inside a `$transaction` (not an update), because kind changes.
- `services/tradeGatekeeper.ts` + `services/tradeRiskConfig.ts` — the risk gate a `Watching` entry must pass to become `APPROVED` before it can open a paper trade: requires entry/stop/target prices, min confidence score, min risk/reward ratio, direction-consistent stop/target placement, volume confirmation, non-zero position size, and no active cooldown on that symbol after a recent loss. All thresholds are env-configurable (`ACCOUNT_BALANCE`, `RISK_PER_TRADE_PERCENT`, `MIN_RISK_REWARD_RATIO`, `MIN_CONFIDENCE_SCORE`, `COOLDOWN_HOURS_AFTER_LOSS`, etc. — see `tradeRiskConfig.ts` for full list and defaults).
- `services/automation.ts` + `automationScheduler.ts` — polls `Watching` entries and open paper trades for price-trigger/exit conditions (env-gated by `AUTOMATION_ENABLED`, interval `AUTOMATION_INTERVAL_MS`); can notify via Discord webhook or Twilio SMS if configured. Manual run: `POST /api/automation/run`.
- `services/startupScanner.ts` — on boot, optionally runs `analyzeSetup` for a configured ticker list (`STARTUP_SCAN_*` env vars) so the watchlist has data without manual scans.
- `utils/symbols.ts` — normalizes free-text ticker input into an `Instrument` (asset class, symbol, display symbol, exchange, timeframe), including stock/crypto name aliasing (e.g. `"bitcoin"` → `BTC`, `"amazon"` → `AMZN`) and crypto pair parsing (`BTC/USD`, `BTC-USD`, bare `BTC`).
- `services/marketSnapshot/` — splits stock data-fetching (Finnhub quote/news, Yahoo intraday candles) from crypto (`crypto.ts`, Coinbase-backed) behind one `getMarketSnapshot(instrument)` entry point.
- `src/generated/prisma/` is generated output (Prisma 7 client, `moduleFormat: cjs`) — do not hand-edit; regenerate with `npm run prisma:generate` after schema changes. Schema is `prisma/schema.prisma`, migrations in `prisma/migrations/`.
- `prisma.config.ts` loads `../../.env` (repo root) for `DATABASE_URL`, independent of the app's own `dotenv.config()` in `index.ts`.

## Agent architecture (`apps/agent`)

- `agent.py` builds a LangGraph `StateGraph` (agent node ⇄ tool node) around `ChatOpenAI`, with tools in `tools/` (`market_data.py`, `technicals.py`, `news.py`). Model selection is `SHADOW_TRADER_MODE` (`fast`/`deep`) mapping to `OPENAI_MODEL_FAST`/`OPENAI_MODEL_DEEP`.
- `server.py` is the FastAPI wrapper exposing `POST /analyze`. It branches on `is_structured_app_request`: if the API sent structured market data (`symbol`/`quote`/`candles`/`signals`), it calls OpenAI directly with a JSON-schema prompt (`build_structured_prompt`) and strictly validates/normalizes the JSON response (`validate_thesis_payload` — enforces required fields, enums like `direction`/`suggestedAction`/`timeHorizon`/`setup.bias`/`setup.setupType`, exactly-2-item `bullishFactors`/`bearishFactors`, confidence in `[0,1]`). If the request is a freeform question instead, it goes through the LangGraph `analyze()` tool-calling path in `agent.py`. A malformed/invalid agent response raises `HTTPException(502)`, which is what triggers the API's rule-based fallback.
- Module imports use a `try/except ModuleNotFoundError` pattern to support running both as `apps.agent.*` (from repo root) and as a bare local package (`from agent import analyze`) depending on working directory/Docker context — preserve this pattern if you touch imports there.

## Web architecture (`apps/web`)

- Auth is NextAuth v5 (`auth.ts`) with GitHub OAuth only, JWT sessions, and an optional allowlist (`AUTH_ALLOWED_EMAILS`) enforced in the `signIn` callback. `middleware.ts` currently has an empty matcher (no route protection at the middleware layer) — auth is instead enforced per-request inside the backend proxy route.
- `app/api/backend/[...path]/route.ts` is the only bridge from the browser to `apps/api`: it requires a NextAuth session, then re-signs every request server-side with `x-api-key: INTERNAL_API_KEY` before forwarding to `API_INTERNAL_BASE_URL`. The browser never sees `INTERNAL_API_KEY`. Any new backend route is reachable automatically through this catch-all — no proxy changes needed.
- `app/page.tsx` is a large single-file client component (~2800 lines) containing essentially the entire UI (ticker scan flow, AI analysis display, watchlist/trade-list/ledger tables, automation controls). There's no component-per-file split yet — when editing, search within this file rather than assuming a components directory.

## Cross-cutting conventions

- Env vars are read once at module scope with numeric/string fallbacks (e.g. `tradeRiskConfig.ts`, `automation.ts`'s `getEntryMovePct`) rather than passed as parameters — follow that pattern for new configuration knobs, and document new vars in `.env.example` and `docs/deployment.md`.
- Money/price parsing from free-text AI output (`parseFirstPriceLevel` in `watchlist.ts`, `parsePriceLevels` in `automation.ts`) is duplicated between those two files with the same regex approach — check both if you change how price levels are extracted from thesis strings.
- Long/short direction is inferred by substring match on the `direction` string (`.includes("BEAR")`/`.includes("SHORT")`) in several places rather than a shared enum — this pattern repeats in `tradeGatekeeper.ts`, `watchlist.ts`, and `automation.ts`.

## Don't do

- Do not hand-edit files in `apps/api/src/generated/prisma/`.
- Do not create individual component files under `apps/web/` without being prompted (everything currently lives in `app/page.tsx`).
- Do not add Vitest or Jest dependencies; tests must use `node:test` and `node:assert/strict`.
- Do not expose `INTERNAL_API_KEY` to the client/browser bundle.

## Documentation

- `docs/deployment.md` — Full environment variable reference and service setups.
- `apps/api/prisma/schema.prisma` — Source of truth for database schema and relations.
- `apps/api/src/services/tradeRiskConfig.ts` — Default thresholds for risk rules and paper-trading approval.
