# Phase 9 Live Proof and Phase 10 Status

Proof run timestamp: `2026-06-10T02:56:45Z`

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Agent: `http://localhost:8000`

Health checks:

- API returned `{"status":"ok","service":"shadow-trader-api"}`.
- Agent returned `{"status":"ok","agent":"shadow_trader","model":"gemini-2.5-pro"}`.
- Web returned HTTP `200`.

NVDA proof:

- Symbol: `NVDA`
- Agent status: `AI_AGENT`
- Quote source: `finnhub`
- Quote price: `208.19`
- Previous close: `208.64`
- News returned: `10` headlines
- Technical source: `yahoo-chart-api`
- 20-day SMA: `218.21`
- Thesis direction: `NEUTRAL`
- Suggested action: `WATCH`
- Confidence score: `0.55`
- Thesis record ID: `b6337737-cd8e-495d-9a09-1e67d4f5cd20`
- Trace ID: `7613488f-1835-4b3e-8eb3-1fa450e0a405`

Watchlist proof:

- Saved watchlist entry ID: `6131be81-fc31-4a93-a44a-2d928089f917`
- Saved trace ID: `7613488f-1835-4b3e-8eb3-1fa450e0a405`

Arize status:

- The Python agent initialized the Arize OpenTelemetry exporter during startup.
- The UI/API trace ID for this real ADK run is `7613488f-1835-4b3e-8eb3-1fa450e0a405`.
- The local agent logs reported `Failed to export span batch code: 403, reason: Forbidden`.
- Phase 10 is therefore not complete until the Arize API key/space key pair is corrected and the same trace ID is visible in the Arize UI.
- Final UI proof requires opening the Arize space, searching that trace ID, and recording the matching trace in the demo video.
