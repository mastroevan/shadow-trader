# Using and Testing Shadow Trader

Shadow Trader is a local AI market research app. It turns a stock ticker or crypto pair into an evidence-backed thesis, stores the thesis in Postgres, and can move setups through a watchlist, paper trade, and closed-trade ledger workflow.

## Prerequisites

- Node.js and npm
- Python 3.11 recommended for the agent
- PostgreSQL running locally or hosted
- Dependencies installed for `apps/web`, `apps/api`, and `apps/agent`
- Environment variables copied from `.env.example` into `.env`

Required for full AI analysis:

- `DATABASE_URL`
- `FINNHUB_API_KEY`
- `OPENAI_API_KEY`

Optional integrations:

- `ARIZE_API_KEY`
- `ARIZE_SPACE_KEY`
- `SHADOW_TRADER_API_KEY`

## Install

From the repo root:

```bash
cd apps/web && npm install
cd ../api && npm install
cd ../agent && python3.11 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

If `python3.11` is not installed, install it with Homebrew:

```bash
brew install python@3.11
```

## Local Database

For Homebrew Postgres, create the app database:

```bash
createdb shadow_trader
```

Set the root `.env` value:

```text
DATABASE_URL=postgresql://localhost:5432/shadow_trader?schema=public
```

Apply Prisma migrations:

```bash
cd apps/api
npx prisma migrate dev
```

## Run Locally

Start the three services in separate terminals.

### 1. Python Agent

```bash
cd apps/agent
source venv/bin/activate
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Expected response includes:

```json
{"status":"ok","mode":"fast"}
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
5. Review the quote, thesis, signals, setup, risk explanation, bullish factors, bearish factors, and headlines when provider data is available.
6. Review the Trust Ledger card for the thesis record ID, generated time, expiration time, start price, evidence counts, and lifecycle status.
7. Click `Add to Watchlist` to save the setup.
8. Move a saved setup through the lifecycle:
   - Keep it as `Watching` while monitoring.
   - Open a paper trade when the setup triggers.
   - Update the mark price to calculate current P/L.
   - Close the paper trade as `Win` or `Loss` to move it to the ledger.

## What To Verify Manually

- The web app loads at `http://localhost:3000`.
- `Analyze` returns an AI thesis with `agentStatus` equal to `AI_AGENT`.
- The quote has a positive price and a visible source.
- The signal list includes intraday indicators such as momentum, VWAP position, EMA alignment, RSI, range, spread/liquidity, and quote health.
- The Trust Ledger appears after analysis and shows a persisted thesis record.
- `Add to Watchlist` saves the setup.
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

Run the BTC proof against the API on port 3001:

```bash
cd /path/to/shadow-trader
API_BASE_URL=http://127.0.0.1:3001 npm run proof:e2e:btc
```

Write the latest proof JSON:

```bash
API_BASE_URL=http://127.0.0.1:3001 npm run proof:e2e:btc -- --write
```

The BTC proof validates:

- API health
- Crypto instrument normalization from `BTC/USD` to `BTC-USD`
- Coinbase quote and candle retrieval
- Signal generation
- AI setup generation
- Thesis persistence
- Market snapshot polling
- Watchlist save
- Paper trade open
- Mark-price P/L update
- Close-to-ledger workflow

## Isolated Local E2E Test

For disposable local state, create a second Postgres database:

```bash
createdb shadow_trader_test
```

Run the API on a separate port:

```bash
cd apps/api
set -a; source ../../.env; set +a
PORT=3003 \
DATABASE_URL=postgresql://localhost:5432/shadow_trader_test?schema=public \
npm run dev
```

In another terminal, apply migrations to the test database:

```bash
cd apps/api
DATABASE_URL=postgresql://localhost:5432/shadow_trader_test?schema=public npx prisma migrate dev
```

Then run the BTC proof against the isolated API:

```bash
cd /path/to/shadow-trader
API_BASE_URL=http://127.0.0.1:3003 npm run proof:e2e:btc
```

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

## Data Storage

Trust records, watchlist entries, active paper trades, and ledger entries are stored in Postgres through Prisma.

## Troubleshooting

If analysis fails:

- Confirm the API is running on `http://localhost:3001`.
- Confirm the agent is running on `http://localhost:8000`.
- Confirm `DATABASE_URL`, market-data keys, and `OPENAI_API_KEY` are present in `.env`.
- Check the API terminal for provider, Prisma, or agent errors.
- Check the agent terminal for OpenAI or JSON validation errors.

If the Trust Ledger does not appear:

- Make sure analysis completed successfully.
- Check `GET http://localhost:3001/api/theses`.
- Check for Prisma or Postgres errors in the API terminal.

If `npx prisma migrate dev` returns `P1010`, make sure your local Postgres user owns the database and has `CREATEDB` privileges for Prisma's shadow database.
