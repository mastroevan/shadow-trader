import os
import json
import uuid
import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ADK imports
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

# Import your agent
from agent import root_agent

# ── Arize / OpenTelemetry setup ───────────────────────────────────────────────
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from openinference.instrumentation.google_adk import GoogleADKInstrumentor

ARIZE_ENDPOINT = "https://otlp.arize.com/v1/traces"

def setup_arize_tracing():
    arize_api_key = os.getenv("ARIZE_API_KEY")
    arize_space_key = os.getenv("ARIZE_SPACE_KEY")

    if not arize_api_key or not arize_space_key:
        print("Arize tracing disabled: ARIZE_API_KEY and ARIZE_SPACE_KEY are not set")
        return

    exporter = OTLPSpanExporter(
        endpoint=ARIZE_ENDPOINT,
        headers={
            "api_key": arize_api_key,
            "space_key": arize_space_key,
        },
    )
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    # This single call instruments ALL ADK agent runs automatically
    GoogleADKInstrumentor().instrument(tracer_provider=provider)
    print("✅ Arize tracing initialized")

# ── FastAPI app ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_arize_tracing()
    yield

app = FastAPI(title="Shadow Trader Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response models ─────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    symbol: str
    quote: dict = Field(default_factory=dict)
    signals: list[str] = Field(default_factory=list)
    signalDetails: list[dict] = Field(default_factory=list)
    news: list[dict] = Field(default_factory=list)
    news_context: str = ""
    sentiment_score: float = 0.5

class ThesisResponse(BaseModel):
    symbol: str
    direction: str
    thesis: str
    confidenceScore: float
    bullishFactors: list[str]
    bearishFactors: list[str]
    riskExplanation: str
    suggestedAction: str
    timeHorizon: str
    traceId: str
    tradePlan: dict = Field(default_factory=dict)
    watchlistEntry: dict = Field(default_factory=dict)

# ── Agent runner setup ────────────────────────────────────────────────────────
session_service = InMemorySessionService()
APP_NAME = "shadow_trader"

async def run_agent(prompt: str, session_id: str) -> str:
    """Run the ADK agent for one turn and return the text response."""
    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service,
    )

    await session_service.create_session(
        app_name=APP_NAME,
        user_id="system",
        session_id=session_id,
    )

    user_message = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=prompt)],
    )

    response_text = ""
    async for event in runner.run_async(
        user_id="system",
        session_id=session_id,
        new_message=user_message,
    ):
        if event.is_final_response() and event.content:
            for part in event.content.parts:
                if part.text:
                    response_text += part.text

    return response_text

# ── Routes ────────────────────────────────────────────────────────────────────
@app.post("/analyze", response_model=ThesisResponse)
async def analyze(req: AnalyzeRequest):
    session_id = str(uuid.uuid4())

    quote_lines = []
    if req.quote:
        price = req.quote.get("price")
        previous_close = req.quote.get("previousClose")
        open_price = req.quote.get("open")
        high = req.quote.get("high")
        low = req.quote.get("low")
        source = req.quote.get("source")
        quote_lines = [
            f"Current price: {price}",
            f"Previous close: {previous_close}",
            f"Open: {open_price}",
            f"Intraday high/low: {high}/{low}",
            f"Quote source: {source}",
        ]

    headline_lines = []
    for item in req.news[:5]:
        headline = item.get("headline", "")
        source = item.get("source", "unknown")
        summary = item.get("summary", "")
        if headline:
            headline_lines.append(f"- {headline} ({source}) -- {summary}")

    news_context = req.news_context or "\n".join(headline_lines)

    # Build the prompt using the data the Node backend sent
    prompt = f"""
Analyze the following market data for {req.symbol} and generate a trading thesis.

SYMBOL: {req.symbol}

QUOTE:
{chr(10).join(quote_lines) if quote_lines else "Quote data was not provided."}

SIGNALS DETECTED ({len(req.signals)} total):
{chr(10).join(f"- {s}" for s in req.signals) if req.signals else "- No specific signals detected"}

SENTIMENT SCORE: {req.sentiment_score:.2f} (0.0 = very bearish, 1.0 = very bullish)

RECENT NEWS CONTEXT:
{news_context if news_context else "No recent headlines were returned by the data provider."}

Use your tools (analyze_market_signal, assess_risk, generate_watchlist_entry) to
process this data, then return a complete JSON trading thesis in the required format.

Quality requirements:
- Use the provided quote, signals, technical indicators, and recent headlines.
- Reference the current price action directly, including the move versus previous close when available.
- Reference at least one specific headline directly when headlines are provided.
- Do not use generic filler such as "No major catalysts" or "No specific news context".
- Always return exactly 2 bullish factors and exactly 2 bearish factors.
- The thesis must include a clear directional view and actionable reasoning.
- suggestedAction must be one of WATCH, ALERT, or AVOID.
- confidenceScore must be a number from 0 to 1.
- Include tradePlan with entryTrigger, invalidation, and watchConditions.
- Include watchlistEntry with symbol, reason, direction, confidenceScore, and createdAt.

Do not include any text outside the JSON object.
""".strip()

    try:
        raw_response = await run_agent(prompt, session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

    # Parse the JSON the agent returned
    try:
        # Strip markdown fences if Gemini wraps the JSON
        clean = raw_response.strip()
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1])
        thesis = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail=f"Agent returned non-JSON response: {raw_response[:200]}"
        )

    # Attach the session_id as the trace ID so the Node backend can link to Arize
    thesis["traceId"] = session_id
    return thesis


@app.get("/health")
def health():
    return {
        "status": "ok",
        "agent": "shadow_trader",
        "model": os.getenv("GEMINI_MODEL", "gemini-3-pro-preview"),
    }
