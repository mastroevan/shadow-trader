# Arize MCP + Agent Builder Setup

Use this for the hackathon submission checklist.

1. Create or open an Arize space for Shadow Trader.
2. Add `ARIZE_API_KEY` and `ARIZE_SPACE_KEY` to the Python agent environment.
3. Run a ticker analysis from the app.
4. Confirm the ADK run appears in Arize traces.
5. In Google Cloud Agent Builder, connect the Arize MCP server for the same Arize project.
6. Use the trace id returned by Shadow Trader to inspect the agent run in Arize.
7. In the demo video, show how Arize helps verify the agent's reasoning path, failures, and confidence over time.

The application-level integration lives in `apps/agent/server.py`, where Google ADK is instrumented with OpenTelemetry and exported to Arize.
