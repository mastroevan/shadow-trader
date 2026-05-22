import os
import httpx
from typing import Any

FINNHUB_KEY = os.getenv("FINNHUB_API_KEY", "")

# ── Tool 1: analyze_market_signal ──────────────────────────────────────────────
def analyze_market_signal(
    symbol: str,
    signals: list[str],
    news_context: str,
    sentiment_score: float,
) -> dict[str, Any]:
    """
    Analyze a set of market signals for a given symbol.
    Called by Gemini when it needs to process detected anomalies.
    """
    # Derive signal strength from count and content
    high_severity_keywords = ["spike", "surge", "crash", "halt", "volume"]
    severity_hits = sum(
        1 for s in signals
        if any(kw in s.lower() for kw in high_severity_keywords)
    )
    signal_strength = "HIGH" if severity_hits >= 2 else "MEDIUM" if severity_hits == 1 else "LOW"

    # Sentiment label
    if sentiment_score >= 0.65:
        sentiment_label = "POSITIVE"
    elif sentiment_score <= 0.35:
        sentiment_label = "NEGATIVE"
    else:
        sentiment_label = "NEUTRAL"

    return {
        "symbol": symbol,
        "signal_strength": signal_strength,
        "sentiment_label": sentiment_label,
        "sentiment_score": sentiment_score,
        "signals_detected": signals,
        "signal_count": len(signals),
        "news_context": news_context,
        "summary": (
            f"{symbol} showing {signal_strength.lower()} signal activity. "
            f"Sentiment is {sentiment_label.lower()} ({sentiment_score:.2f}). "
            f"{len(signals)} signal(s) detected: {', '.join(signals)}."
        ),
    }


# ── Tool 2: assess_risk ────────────────────────────────────────────────────────
def assess_risk(
    symbol: str,
    direction: str,
    thesis: str,
) -> dict[str, Any]:
    """
    Assess risk level for a directional thesis on a symbol.
    Called by Gemini after it has formed an initial thesis.
    """
    # Identify risk keywords in the thesis
    high_risk_phrases = [
        "uncertain", "volatile", "speculative", "unconfirmed",
        "earnings", "fda", "regulation", "lawsuit", "recall",
    ]
    medium_risk_phrases = [
        "watch", "monitor", "mixed", "conflicting", "partial"
    ]

    thesis_lower = thesis.lower()
    high_hits = sum(1 for p in high_risk_phrases if p in thesis_lower)
    medium_hits = sum(1 for p in medium_risk_phrases if p in thesis_lower)

    if high_hits >= 2:
        risk_level = "HIGH"
        risk_note = "Multiple high-risk factors detected in thesis. Proceed with caution."
    elif high_hits == 1 or medium_hits >= 2:
        risk_level = "MEDIUM"
        risk_note = "Some risk factors present. Monitor closely."
    else:
        risk_level = "LOW"
        risk_note = "No major risk flags detected in thesis."

    # Contrarian warning: if direction conflicts with news sentiment, flag it
    contrarian_flag = False
    if direction == "BULLISH" and "negative" in thesis_lower:
        contrarian_flag = True
    if direction == "BEARISH" and "positive" in thesis_lower:
        contrarian_flag = True

    return {
        "symbol": symbol,
        "direction": direction,
        "risk_level": risk_level,
        "risk_summary": f"Risk assessment for {symbol} ({direction}): {risk_note}",
        "contrarian_signal": contrarian_flag,
        "note": "Contrarian signal detected — thesis direction conflicts with sentiment." if contrarian_flag else "",
    }


# ── Tool 3: generate_watchlist_entry ──────────────────────────────────────────
def generate_watchlist_entry(
    symbol: str,
    thesis: object,
) -> dict[str, Any]:
    """
    Create a structured watchlist entry for the symbol.
    Called by Gemini when it decides the signal warrants tracking.
    """
    import json
    from datetime import datetime, timezone

    # thesis may arrive as dict or string depending on how Gemini serializes it
    if isinstance(thesis, str):
        try:
            thesis_dict = json.loads(thesis)
        except Exception:
            thesis_dict = {"raw": thesis}
    else:
        thesis_dict = thesis if isinstance(thesis, dict) else {}

    confidence = thesis_dict.get("confidenceScore", 0.0)
    direction = thesis_dict.get("direction", "NEUTRAL")
    action = thesis_dict.get("suggestedAction", "WATCH")

    return {
        "symbol": symbol,
        "direction": direction,
        "confidence": confidence,
        "suggested_action": action,
        "thesis_summary": thesis_dict.get("thesis", "No thesis provided"),
        "added_at": datetime.now(timezone.utc).isoformat(),
        "watchlist_entry": (
            f"{symbol} | {direction} | Confidence: {confidence:.0%} | "
            f"Action: {action} | Added: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        ),
    }