# Deployment

Shadow Trader deploys as three services:

- `shadow-trader-agent`: Python FastAPI OpenAI/LangGraph agent from `apps/agent`.
- `shadow-trader-api`: Node/Express API from `apps/api`.
- `shadow-trader-web`: Next.js UI from `apps/web`.

The active deployment definition is `render.yaml`.

## Required Services

Provision a PostgreSQL database before deploying the API. The API uses Prisma 7 with the `@prisma/adapter-pg` driver adapter and requires `DATABASE_URL`.

The Python agent is a separate HTTP service. The API calls it through `AGENT_URL`, which should point to the agent `/analyze` endpoint.

## Render Blueprint

1. Push the repo to GitHub.
2. Create a Render Blueprint from `render.yaml`.
3. Add the secret environment variables marked `sync: false`.
4. Deploy the agent first.
5. Deploy the API after the agent URL and database URL are set.
6. Deploy the web app after the API URL and public API key are set.

## Environment Variables

Agent service:

```text
OPENAI_API_KEY
OPENAI_MODEL_FAST=gpt-5.4-mini
OPENAI_MODEL_DEEP=gpt-5.5
SHADOW_TRADER_MODE=fast
FINNHUB_API_KEY
ARIZE_API_KEY
ARIZE_SPACE_KEY
```

API service:

```text
DATABASE_URL=<postgres connection string>
FINNHUB_API_KEY
ARIZE_API_KEY
ARIZE_SPACE_KEY
AGENT_URL=https://shadow-trader-agent.onrender.com/analyze
AGENT_TIMEOUT_MS=95000
NEXT_PUBLIC_FRONTEND_URL=https://shadow-trader-web.onrender.com
INTERNAL_API_KEY
```

Web service:

```text
API_INTERNAL_BASE_URL=https://shadow-trader-api.onrender.com
INTERNAL_API_KEY=<same value as API service>
```

## Database Migration

Run Prisma migrations against the deployed database before relying on the hosted API:

```bash
cd apps/api
DATABASE_URL="<hosted postgres url>" npx prisma migrate deploy
```

For local development, use:

```bash
cd apps/api
npx prisma migrate dev
```

## Hosted URL

Default deployed web URL:

```text
https://shadow-trader-web.onrender.com
```

If service names change, update `render.yaml`, `README.md`, and the environment variable URLs.

## Verification

After deployment:

```bash
curl https://shadow-trader-agent.onrender.com/health
curl https://shadow-trader-api.onrender.com/health
```

Then run a full proof against the hosted API:

```bash
API_BASE_URL=https://shadow-trader-api.onrender.com npm run proof:e2e:btc
```
