# Using and Testing Shadow Trader

Shadow Trader is a local AI market research app. It turns a ticker or crypto pair into an evidence-backed thesis, stores the thesis in the Trust Ledger, and can move setups through a watchlist, paper trade, and closed-trade ledger workflow.

This document is both the user guide and the test guide. If a feature is important enough to demo, there is a matching way to verify it.

## Prerequisites

- Node.js and npm
- Python 3
- Dependencies installed for `apps/web`, `apps/api`, and `apps/agent`
- Environment variables copied from `.env.example` into `.env`

Required for full AI analysis:

- `FINNHUB_API_KEY`
- `GOOGLE_API_KEY` or the configured Vertex/Gemini environment

Optional integrations:

- `ARIZE_API_KEY`
- `ARIZE_SPACE_KEY`
- `SHADOW_TRADER_API_KEY`

## Install

From the repo root:

```bash
cd apps/web && npm install
cd ../api && npm install
cd ../agent && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

If the API fails at runtime with a `better-sqlite3` Node ABI error after changing Node versions, rebuild the native dependency:

```bash
cd apps/api
npm rebuild better-sqlite3
```

## Run Locally

Start the three services in separate terminals.

### 1. Python Agent

```bash
cd apps/agent
source venv/bin/activate
uvicorn server:app --reload --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Expected response includes:

```json
{"agent":"shadow_trader"}
```

### 2. Node API

```bash
cd apps/api
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:3001/health
```

Expected response:

```json
{"status":"ok","service":"shadow-trader-api"}
```

### 3. Web App

```bash
cd apps/web
npm run dev
```

Open:

```text
http://localhost:3000
```

## Use the App

1. Open `http://localhost:3000`.
2. Enter a stock ticker such as `NVDA`, `AAPL`, `TSLA`, `META`, or `AMZN`, or a crypto pair such as `BTC/USD`.
3. Select the asset class and timeframe when needed.
4. Click `Analyze`.
5. Review the quote, thesis, signals, setup, risk explanation, bullish factors, bearish factors, and headlines when the provider returns news.
6. Review the `Trust Ledger` card for the thesis record ID, generated time, expiration time, start price, evidence counts, and lifecycle status.
7. Click `Add to Watchlist` to save the setup.
8. Move a saved setup through the lifecycle:
   - Keep it as `Watching` while monitoring.
   - Open a paper trade when the setup triggers.
   - Update the mark price to calculate current P/L.
   - Close the paper trade as `Win` or `Loss` to move it to the ledger.

## What to Verify Manually

Use this checklist when testing through the UI:

- The web app loads at `http://localhost:3000`.
- `Analyze` returns an AI thesis with `agentStatus` equal to `AI_AGENT`.
- The quote has a positive price and a visible source.
- The signal list includes intraday indicators such as momentum, VWAP position, EMA alignment, RSI, and quote health.
- The Trust Ledger appears after analysis and shows a persisted thesis record.
- `Add to Watchlist` saves the setup to the database.
- Paper trade open, mark-price update, and close-to-ledger actions work from the saved watchlist entry.

## Automated Tests

Run the API unit tests:

```bash
cd apps/api
npm test
```

Run the API production build:

```bash
cd apps/api
npm run build
```

Run the web production build:

```bash
cd apps/web
npm run build
```

Run the stock proof against the API on port 3001:

```bash
cd /path/to/shadow-trader
npm run proof:e2e
```

Run the BTC proof against the API on port 3001:

```bash
cd /path/to/shadow-trader
npm run proof:e2e:btc
```

The BTC proof validates:

- API health
- Crypto instrument normalization from `BTC/USD` to `BTC-USD`
- Coinbase quote and candle retrieval
- Signal generation
- AI setup generation
- Market snapshot polling
- Watchlist save
- Paper trade open
- Mark-price P/L update
- Close-to-ledger workflow

## Isolated Local E2E Test

For repeatable local testing without touching the normal local database, run a second API instance on a different port with an isolated SQLite database:

```bash
cd apps/api
set -a; source ../../.env; set +a
PORT=3003 \
SHADOW_TRADER_SKIP_LEGACY_IMPORT=true \
DATABASE_URL=file:/private/tmp/shadow-trader-db-only-test.db \
npm run dev
```

Then run the BTC proof against that isolated API:

```bash
cd /path/to/shadow-trader
API_BASE_URL=http://127.0.0.1:3003 npm run proof:e2e:btc
```

This is the recommended local e2e test when you want disposable database state.

## API Smoke Tests

Analyze a stock:

```bash
curl -s -X POST http://127.0.0.1:3001/api/setups/analyze \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"NVDA"}'
```

Analyze BTC:

```bash
curl -s -X POST http://127.0.0.1:3001/api/setups/analyze \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USD","assetClass":"crypto","timeframe":"5m"}'
```

Poll a market snapshot:

```bash
curl -s -X POST http://127.0.0.1:3001/api/market/snapshot \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USD","assetClass":"crypto","timeframe":"5m"}'
```

List saved records:

```bash
curl http://127.0.0.1:3001/api/theses
curl http://127.0.0.1:3001/api/watchlist
curl http://127.0.0.1:3001/api/trade-list
curl http://127.0.0.1:3001/api/trust-ledger
```

If `SHADOW_TRADER_API_KEY` is set, include:

```bash
-H "Authorization: Bearer <key>"
```

## Current Test Results

Last verified locally on 2026-07-01:

- `cd apps/api && npm test`: passed, 5 tests.
- `cd apps/api && npm run build`: passed.
- `cd apps/web && npm run build`: passed.
- API health on `127.0.0.1:3001`: passed.
- Agent health on `127.0.0.1:8000`: passed.
- Web HTTP check on `127.0.0.1:3000`: passed.
- `API_BASE_URL=http://127.0.0.1:3003 npm run proof:e2e:btc` with isolated database-only API: passed.

Observed during the same run:

- `npm run proof:e2e` reached analysis, but the current provider path returned `yahoo-chart-api` instead of the proof script's expected `finnhub` source. The app still returned an AI thesis, persisted a thesis record, and produced signals.
- Watchlist, paper trade, and ledger state now rely on the database only.
- The in-app browser automation tool was unavailable in this environment, so UI validation was limited to web HTTP availability plus API/e2e coverage.

## Data Storage

Trust records, watchlist entries, active paper trades, and ledger entries are stored by the API in SQLite through Prisma. For isolated tests, use a temporary `DATABASE_URL` under `/private/tmp` or another disposable path.

The app also has legacy local data import behavior. For clean isolated tests, set:

```bash
SHADOW_TRADER_SKIP_LEGACY_IMPORT=true
```

## Troubleshooting

If analysis fails:

- Confirm the API is running on `http://localhost:3001`.
- Confirm the agent is running on `http://localhost:8000`.
- Confirm market-data keys are present in `.env`.
- Confirm Gemini credentials are present for the agent.
- Check the API terminal for provider, Prisma, or agent errors.
- Check the agent terminal for Gemini or JSON validation errors.

If the Trust Ledger does not appear:

- Make sure analysis completed successfully.
- Check `GET http://localhost:3001/api/theses`.
- Check for Prisma or SQLite errors in the API terminal.

If proof scripts cannot connect to `127.0.0.1` from a sandboxed environment, rerun them with permission to access the local API.
