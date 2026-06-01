# Using Shadow Trader

Shadow Trader is a local AI market research app. It turns a ticker symbol into an evidence-backed market thesis, then saves that thesis as a trackable record in the Trust Ledger.

## Prerequisites

- Node.js installed
- Python 3 installed
- App dependencies installed for `apps/web`, `apps/api`, and `apps/agent`
- Environment variables configured from `.env.example`

Required keys for a full analysis:

- `FINNHUB_API_KEY`
- `GOOGLE_API_KEY` or the configured Vertex/Gemini environment

Optional:

- `ARIZE_API_KEY`
- `ARIZE_SPACE_KEY`

## Run Locally

Start the three services in separate terminals.

### 1. Python Agent

```bash
cd apps/agent
source venv/bin/activate
uvicorn server:app --reload --port 8000
```

Health check:

```text
http://localhost:8000/health
```

### 2. Node API

```bash
cd apps/api
npm run dev
```

Health check:

```text
http://localhost:3001/health
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

## Basic App Flow

1. Open the web app at `http://localhost:3000`.
2. Enter a ticker such as `NVDA`, `AAPL`, `TSLA`, `META`, or `AMZN`.
3. Click `Analyze`.
4. Review the quote, thesis, signals, headlines, action plan, bullish factors, bearish factors, and risk explanation.
5. Optionally click `Add to Watchlist` to save the action plan.

## Phase 1 Trust: What It Does

Phase 1 Trust makes every analysis auditable.

When you analyze a ticker, the backend now creates a persistent thesis record containing:

- Thesis record ID
- Symbol
- Direction
- Suggested action
- Confidence score
- Initial price
- Generated timestamp
- Expiration timestamp
- Trace ID
- Quote snapshot
- Signal snapshot
- Technical indicator snapshot
- News/headline snapshot
- Lifecycle status
- Optional outcome

This is the product's trust layer: the AI thesis is tied to the evidence available when the thesis was generated.

## Phase 2 Automation: What It Does

Phase 2 adds a local automation layer on top of thesis records.

The API can now monitor active theses and create alerts when:

- a bullish thesis moves materially higher from its start price
- a bullish thesis moves materially lower and may be invalidated
- a bearish thesis moves materially lower from its start price
- a bearish thesis moves materially higher and may be invalidated
- a thesis reaches its expiration window
- monitoring fails for a thesis

Automation is local and conservative. It creates alerts and status updates; it does not place trades.

## Using The Automation Desk

The `Automation Desk` card appears near the top of the app.

It shows:

- number of active thesis records
- number of open alerts
- thesis records expiring soon
- thesis outcomes resolved today
- a short daily brief
- recent open automation alerts

Click `Run Monitor` to manually check active thesis records immediately.

When alerts appear, review them and click `Acknowledge` after you have handled them.

The backend also starts a scheduler when the API boots. By default it checks active theses every 15 minutes.

Configure it with:

```text
AUTOMATION_ENABLED=true
AUTOMATION_INTERVAL_MS=900000
```

Set `AUTOMATION_ENABLED=false` to disable the background scheduler.

## Using The Trust Ledger

After an analysis completes, the page shows a `Trust Ledger` card.

Use it to inspect:

- `Record`: short thesis record ID
- `Generated`: when the thesis was created
- `Expires`: when the thesis should be reviewed
- `Start Price`: price at thesis creation
- `Signals`: number of signals captured
- `Headlines`: number of news items captured
- `SMA`: captured 20-day moving average, when available
- `Status`: current lifecycle state

The Trust Ledger is meant to answer:

- What did the AI say?
- What evidence did it use?
- When was the thesis created?
- What price was the stock at?
- Is the thesis still active, invalidated, expired, or resolved?

## Marking Thesis Outcomes

The Trust Ledger includes outcome buttons:

- `Mark triggered`
- `Mark invalidated`
- `Mark expired`
- `Mark resolved`

Use these when reviewing a thesis later.

Suggested meanings:

- `TRIGGERED`: the thesis setup activated or the watched condition occurred.
- `INVALIDATED`: the thesis no longer holds because price action, news, or signals contradicted it.
- `EXPIRED`: the thesis reached its review window without a clear trigger.
- `RESOLVED`: the thesis has been manually reviewed and closed.

When you mark an outcome, the API stores:

- final status
- resolved timestamp
- current quote price as final price
- a short note from the workspace

## Recent Thesis Records

The `Recent Thesis Records` card shows the latest saved thesis records.

Use this to confirm that analyses are being persisted and to quickly see recent:

- symbols
- directions
- statuses
- generation times

## Local Data Storage

Trust records and watchlist entries are stored locally by the API service under:

```text
apps/api/data/
```

This directory is runtime data and is ignored by git.

Deleting it will not break the app, but it will remove local saved thesis/watchlist history. The app recreates it when new records are saved.

## API Endpoints

Main analysis endpoint:

```text
POST /api/analyze
```

Thesis trust endpoints:

```text
GET /api/theses
GET /api/theses/:id
PATCH /api/theses/:id/outcome
```

Automation endpoints:

```text
GET /api/alerts
PATCH /api/alerts/:id/acknowledge
POST /api/automation/monitor
GET /api/daily-brief
```

Watchlist endpoints:

```text
GET /api/watchlist
POST /api/watchlist
DELETE /api/watchlist/:id
```

## Optional API Key Protection

If `SHADOW_TRADER_API_KEY` is set on the API, all `/api/*` routes require:

```text
Authorization: Bearer <key>
```

For the web app to call the protected API, set:

```text
NEXT_PUBLIC_SHADOW_TRADER_API_KEY=<same key>
```

For local development, leaving these blank keeps the app easy to run.

## Troubleshooting

If analysis fails:

- Confirm the API is running on `http://localhost:3001`.
- Confirm the agent is running on `http://localhost:8000`.
- Confirm `FINNHUB_API_KEY` is set.
- Confirm Gemini/Vertex credentials are set for the agent.
- Check the API terminal for provider or agent errors.
- Check the agent terminal for Gemini or JSON validation errors.

If the Trust Ledger does not appear:

- Make sure the analysis request completed successfully.
- Make sure the API can write to `apps/api/data/`.
- Check `GET http://localhost:3001/api/theses`.
