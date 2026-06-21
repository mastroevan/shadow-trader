# Deployment

This repo can run as a three-service personal deployment on Render:

- `shadow-trader-agent`: Python FastAPI ADK agent, exported from `apps/agent`.
- `shadow-trader-api`: Node/Express API, exported from `apps/api`.
- `shadow-trader-web`: Next.js UI, exported from `apps/web`.

## Render Blueprint

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from `render.yaml`.
3. Set the secret environment variables marked `sync: false`.
4. Deploy `shadow-trader-agent` first, then `shadow-trader-api`, then `shadow-trader-web`.
5. Open the web service URL and run the NVDA proof flow.

Required hosted variables:

```text
FINNHUB_API_KEY
GOOGLE_API_KEY
ARIZE_API_KEY
ARIZE_SPACE_KEY
SHADOW_TRADER_API_KEY
NEXT_PUBLIC_SHADOW_TRADER_API_KEY
```

For Vertex AI instead of Gemini API key, configure:

```text
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=<project>
GOOGLE_CLOUD_LOCATION=<region>
```

## Hosted URL

Default deployed web URL:

```text
https://shadow-trader-web.onrender.com
```

If the Render service names are changed, update `render.yaml` and `README.md` with the actual web URL.
