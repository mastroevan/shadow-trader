# Devpost Checklist

## Project Links

- Hosted project URL: `https://shadow-trader-web.onrender.com`
- Public repository URL: add the GitHub repo URL after publishing.
- Track: Financial Services
- Partner track: Arize

## Arize Proof

Use the trace ID returned by the UI after an NVDA run. For the June 10, 2026 local proof run:

```text
7613488f-1835-4b3e-8eb3-1fa450e0a405
```

In Arize:

1. Open the Shadow Trader space.
2. Go to tracing or spans for the ADK project.
3. Search for the trace/session ID from the UI.
4. Confirm the ADK run includes the Gemini call and tool spans.
5. Capture this in the demo video.

Current blocker: the local proof run exported Gemini spans but Arize returned `403 Forbidden`. Refresh `ARIZE_API_KEY` and `ARIZE_SPACE_KEY`, rerun `npm run proof:e2e -- --write`, then use the new trace ID for the final recording.

## Demo Video Shot List

Target length: 3 minutes.

1. Open the hosted Shadow Trader URL.
2. Run `NVDA`.
3. Show the live quote, technical signals, and recent headlines.
4. Show the Gemini thesis, action plan, risk explanation, and trace ID.
5. Save the watchlist entry.
6. Show the saved watchlist setup.
7. Open Arize, search the same trace ID, and show the matching trace.
8. Close by explaining that the thesis is persisted, observable, and saved for follow-up.
