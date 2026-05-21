def analyze_market_signal(
    symbol: str,
    signals: list[str],
    news_context: str,
    sentiment_score: float,
):
    return {
        "symbol": symbol,
        "signal_strength": "HIGH",
        "summary": f"{symbol} showing unusual activity with sentiment score {sentiment_score}",
        "signals": signals,
        "news_context": news_context,
    }


def assess_risk(
    symbol: str,
    direction: str,
    thesis: str,
):
    return {
        "symbol": symbol,
        "direction": direction,
        "risk_level": "MEDIUM",
        "risk_summary": f"Risk assessment for {symbol}: {thesis}",
    }

def generate_watchlist_entry(
        symbol: str,
        thesis: object,
):
    return {
        "symbol": symbol,
        "thesis": thesis,
        "watchlist_entry": f"Added {symbol} to watchlist based on thesis: {thesis}",
    }

