from langchain_core.tools import tool
import yfinance as yf


@tool
def get_technical_analysis(ticker: str) -> dict:
    """
    Get simple technical analysis for a stock ticker.

    Use this when the user asks about trend, moving averages,
    support, resistance, breakout, breakdown, or trading setup.

    Args:
        ticker: Stock ticker symbol such as TSLA, NVDA, AAPL, META, or AMZN.

    Returns:
        Dictionary containing SMA levels, recent trend, support,
        resistance, and basic momentum interpretation.
    """
    ticker = ticker.upper().strip()

    stock = yf.Ticker(ticker)
    history = stock.history(period="6mo", interval="1d")

    if history.empty or len(history) < 50:
        return {
            "ticker": ticker,
            "error": "Not enough historical data for technical analysis."
        }

    history["SMA_20"] = history["Close"].rolling(window=20).mean()
    history["SMA_50"] = history["Close"].rolling(window=50).mean()

    latest = history.iloc[-1]
    previous = history.iloc[-2]

    current_price = float(latest["Close"])
    sma_20 = float(latest["SMA_20"])
    sma_50 = float(latest["SMA_50"])

    recent_20 = history.tail(20)

    support = float(recent_20["Low"].min())
    resistance = float(recent_20["High"].max())

    if current_price > sma_20 > sma_50:
        trend = "bullish"
    elif current_price < sma_20 < sma_50:
        trend = "bearish"
    elif current_price > sma_20 and sma_20 < sma_50:
        trend = "possible recovery"
    elif current_price < sma_20 and sma_20 > sma_50:
        trend = "possible weakness"
    else:
        trend = "neutral/choppy"

    price_change = current_price - float(previous["Close"])
    percent_change = price_change / float(previous["Close"]) * 100

    return {
        "ticker": ticker,
        "current_price": round(current_price, 2),
        "sma_20": round(sma_20, 2),
        "sma_50": round(sma_50, 2),
        "support_20d": round(support, 2),
        "resistance_20d": round(resistance, 2),
        "daily_change_percent": round(percent_change, 2),
        "trend": trend,
        "interpretation": (
            f"{ticker} is currently {trend}. "
            f"Price is {'above' if current_price > sma_20 else 'below'} the 20-day SMA "
            f"and {'above' if current_price > sma_50 else 'below'} the 50-day SMA."
        ),
        "note": "Technical analysis is simplified and should not be treated as financial advice."
    }