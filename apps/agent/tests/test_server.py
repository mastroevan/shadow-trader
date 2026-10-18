import os
import sys
from unittest.mock import patch
import pytest

# Ensure apps/agent is in PYTHONPATH so server can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import (
    AnalyzeRequest,
    build_question_prompt,
    build_structured_prompt,
    compact_text,
    get_mode_and_model,
    get_openai_timeout_seconds,
    health_check,
    is_structured_app_request,
    parse_agent_json,
    require_choice,
    require_confidence,
    require_string,
    require_string_list,
    root,
    validate_thesis_payload,
)
from fastapi import HTTPException


def test_root():
    data = root()
    assert data["status"] == "running"
    assert "Shadow Trader" in data["service"]


def test_health_check_defaults():
    with patch.dict(os.environ, {"SHADOW_TRADER_MODE": "fast"}, clear=False):
        data = health_check()
        assert data["status"] == "ok"
        assert data["mode"] == "fast"
        assert data["model"] == "gpt-4o-mini"


def test_get_mode_and_model_fast_and_deep():
    mode, model = get_mode_and_model("fast")
    assert mode == "fast"
    assert model == "gpt-4o-mini"

    mode, model = get_mode_and_model("deep")
    assert mode == "deep"
    assert model == "gpt-4o"


def test_get_mode_and_model_invalid():
    with pytest.raises(HTTPException) as exc_info:
        get_mode_and_model("super_deep")
    assert exc_info.value.status_code == 400
    assert "mode must be either 'fast' or 'deep'" in str(exc_info.value.detail)


def test_get_openai_timeout_seconds():
    with patch.dict(os.environ, {"OPENAI_TIMEOUT_MS": "30000"}):
        assert get_openai_timeout_seconds() == 30.0

    # Minimum bound enforced (5.0s)
    with patch.dict(os.environ, {"OPENAI_TIMEOUT_MS": "1000"}):
        assert get_openai_timeout_seconds() == 5.0

    # Non-numeric fallback
    with patch.dict(os.environ, {"OPENAI_TIMEOUT_MS": "invalid"}):
        assert get_openai_timeout_seconds() == 60.0


def test_is_structured_app_request():
    assert is_structured_app_request(AnalyzeRequest(symbol="BTC/USD")) is True
    assert is_structured_app_request(AnalyzeRequest(quote={"price": 100})) is True
    assert is_structured_app_request(AnalyzeRequest(candles=[{"close": 100}])) is True
    assert is_structured_app_request(AnalyzeRequest(signals=["RSI_OVERSOLD"])) is True
    assert is_structured_app_request(AnalyzeRequest(question="What is the trend?")) is False


def test_build_question_prompt():
    req1 = AnalyzeRequest(ticker="NVDA", question="What is the setup?")
    assert build_question_prompt(req1) == "Analyze NVDA. User request: What is the setup?"

    req2 = AnalyzeRequest(question="General market summary")
    assert build_question_prompt(req2) == "General market summary"

    req3 = AnalyzeRequest(ticker="AAPL")
    assert build_question_prompt(req3) == "Analyze AAPL."

    req4 = AnalyzeRequest()
    with pytest.raises(HTTPException) as exc_info:
        build_question_prompt(req4)
    assert exc_info.value.status_code == 422


def test_build_structured_prompt():
    req = AnalyzeRequest(
        symbol="BTC/USD",
        quote={"price": 65000, "source": "finnhub"},
        candles=[{"timestamp": 1700000000, "close": 65000}],
        signals=["VOLUME_SPIKE"],
        news=[{"headline": "Bitcoin hits support", "source": "Reuters", "summary": "Crypto overview"}],
    )
    prompt = build_structured_prompt(req)
    assert "BTC/USD" in prompt
    assert "65000" in prompt
    assert "VOLUME_SPIKE" in prompt
    assert "Bitcoin hits support" in prompt


def test_parse_agent_json():
    # Plain JSON
    raw = '{"symbol": "NVDA", "direction": "BULLISH"}'
    assert parse_agent_json(raw) == {"symbol": "NVDA", "direction": "BULLISH"}

    # Fenced JSON with ```json ... ```
    fenced = '```json\n{"symbol": "TSLA", "direction": "BEARISH"}\n```'
    assert parse_agent_json(fenced) == {"symbol": "TSLA", "direction": "BEARISH"}

    # Invalid JSON string
    with pytest.raises(HTTPException) as exc_info:
        parse_agent_json("not valid json")
    assert exc_info.value.status_code == 502

    # Non-dict JSON
    with pytest.raises(HTTPException) as exc_info:
        parse_agent_json('["an", "array"]')
    assert exc_info.value.status_code == 502


def test_validate_thesis_payload_valid():
    valid_payload = {
        "symbol": "nvda",
        "direction": "bullish",
        "thesis": "Strong continuation setup above VWAP.",
        "strategy": "Breakout Momentum",
        "tradingStyle": "Day Trading",
        "analysisTimeframe": "5m",
        "expectedHold": "1-3 hours",
        "analysisReason": "High volume with intraday breakout.",
        "confidenceScore": 0.82,
        "bullishFactors": ["Above VWAP", "Volume surge"],
        "bearishFactors": ["Overhead resistance", "Broad market chop"],
        "riskExplanation": "Risk capped at 1.5% below support.",
        "suggestedAction": "WATCH",
        "timeHorizon": "SHORT",
        "setup": {
            "bias": "LONG",
            "setupType": "BREAKOUT",
            "entryZone": "$125.00 - $125.50",
            "stopLoss": "$123.50",
            "takeProfit": "$130.00",
            "riskReward": "2.5:1",
            "maxHoldTime": "2 hours",
            "warnings": ["Monitor broader market"],
        },
        "tradePlan": {
            "entryTrigger": "Cross above $125.50",
            "invalidation": "Break below $123.50",
            "watchConditions": ["Volume remains above average"],
        },
        "watchlistEntry": {
            "symbol": "NVDA",
            "reason": "Breakout candidate",
            "direction": "BULLISH",
            "confidenceScore": 0.82,
        },
    }

    validated = validate_thesis_payload(valid_payload, fallback_symbol=None)
    assert validated["symbol"] == "NVDA"
    assert validated["direction"] == "BULLISH"
    assert validated["confidenceScore"] == 0.82
    assert validated["setup"]["bias"] == "LONG"
    assert validated["setup"]["setupType"] == "BREAKOUT"


def test_validate_thesis_payload_invalid_direction():
    payload = {
        "symbol": "NVDA",
        "direction": "INVALID_DIRECTION",
        "suggestedAction": "WATCH",
        "timeHorizon": "SHORT",
    }
    with pytest.raises(HTTPException) as exc_info:
        validate_thesis_payload(payload, fallback_symbol=None)
    assert exc_info.value.status_code == 502
    assert "direction must be one of" in exc_info.value.detail


def test_require_confidence():
    assert require_confidence(0.75) == 0.75
    assert require_confidence(1) == 1.0
    assert require_confidence(0) == 0.0

    with pytest.raises(HTTPException):
        require_confidence(-0.1)

    with pytest.raises(HTTPException):
        require_confidence(1.5)

    with pytest.raises(HTTPException):
        require_confidence("not_a_number")


def test_require_string_list():
    assert require_string_list(["a", "b"], "factors", exact_count=2) == ["a", "b"]

    with pytest.raises(HTTPException) as exc_info:
        require_string_list(["a"], "factors", exact_count=2)
    assert "must contain exactly 2 items" in exc_info.value.detail


def test_compact_text():
    assert compact_text("Short text", 20) == "Short text"
    assert compact_text("A very long text that exceeds the limit", 10) == "A very lon..."
    assert compact_text(None, 10) == ""


def test_get_models_endpoint():
    from server import get_models
    data = get_models()
    assert "providers" in data
    provider_ids = [p["id"] for p in data["providers"]]
    assert "openai" in provider_ids
    assert "anthropic" in provider_ids
    assert "google" in provider_ids


def test_resolve_provider_and_model_all_providers():
    from providers import resolve_provider_and_model

    p, m, mode = resolve_provider_and_model("openai", None, "fast")
    assert p == "openai"
    assert m == "gpt-4o-mini"
    assert mode == "fast"

    p, m, mode = resolve_provider_and_model("anthropic", None, "deep")
    assert p == "anthropic"
    assert m == "claude-3-5-sonnet-20241022"
    assert mode == "deep"

    p, m, mode = resolve_provider_and_model("google", None, "fast")
    assert p == "google"
    assert m == "gemini-2.0-flash"
    assert mode == "fast"


def test_resolve_provider_and_model_invalid():
    from providers import resolve_provider_and_model

    with pytest.raises(ValueError) as exc:
        resolve_provider_and_model("invalid_provider")
    assert "Unsupported provider" in str(exc.value)


def test_compare_models_endpoint_consensus():
    from server import compare_models, CompareRequest, CompareTarget

    valid_thesis_json = """{
        "symbol": "BTC/USD",
        "direction": "BULLISH",
        "thesis": "Strong upward momentum above VWAP and EMA alignment.",
        "strategy": "Intraday momentum",
        "tradingStyle": "Day Trading",
        "analysisTimeframe": "5m",
        "expectedHold": "1-3 hours",
        "analysisReason": "High volume breakout confirmed.",
        "confidenceScore": 0.85,
        "bullishFactors": ["Above VWAP", "Rising volume"],
        "bearishFactors": ["Near overhead resistance", "Short-term overbought"],
        "riskExplanation": "Standard stop loss below swing low.",
        "suggestedAction": "ALERT",
        "timeHorizon": "SHORT",
        "setup": {
            "bias": "LONG",
            "setupType": "BREAKOUT",
            "entryZone": "68000-68100",
            "stopLoss": "67500",
            "takeProfit": "69200",
            "riskReward": "2.0:1",
            "maxHoldTime": "2h",
            "warnings": ["Monitor volume continuation"]
        },
        "tradePlan": {
            "entryTrigger": "Cross above 68100",
            "invalidation": "Drop below 67500",
            "watchConditions": ["Volume surge"]
        },
        "watchlistEntry": {
            "symbol": "BTC/USD",
            "reason": "Breakout pattern",
            "direction": "BULLISH",
            "confidenceScore": 0.85,
            "createdAt": "2026-10-17T00:00:00Z"
        }
    }"""

    req = CompareRequest(
        targets=[
            CompareTarget(provider="openai", model="gpt-4o-mini"),
            CompareTarget(provider="anthropic", model="claude-3-5-haiku-20241022"),
        ],
        analysis=AnalyzeRequest(symbol="BTC/USD", quote={"price": 68000}),
    )

    with patch("server.analyze_structured_prompt", return_value=valid_thesis_json):
        result = compare_models(req)
        assert result["symbol"] == "BTC/USD"
        assert result["consensus"]["majorityBias"] == "LONG"
        assert result["consensus"]["majorityDirection"] == "BULLISH"
        assert result["consensus"]["agreementScore"] == 1.0
        assert result["consensus"]["averageConfidence"] == 0.85
        assert len(result["comparisons"]) == 2

