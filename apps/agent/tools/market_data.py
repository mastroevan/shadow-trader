from langchain_core.tools import tool
import yfinance as yf


@tool
def get_market_data(ticker: str) -> dict:
    """
    Get recent market data for a stock ticker.

    Use this when analyzing price, volume, support, resistance,
    recent daily candles, or short-term trading direction.

    Args:
        ticker: Stock ticker symbol such as TSLA, NVDA, AAPL, META, or AMZN.

    Returns:
        Dictionary containing current price, previous close, day high,
        day low, volume, and recent daily candles.
    """
    ticker = ticker.upper().strip()

    stock = yf.Ticker(ticker)

    info = stock.fast_info
    history = stock.history(period="3mo", interval="1d")

    if history.empty:
        return {
            "ticker": ticker,
            "error": "No market data found for this ticker."
        }

    latest = history.iloc[-1]

    recent_candles = []

    for date, row in history.tail(10).iterrows():
        recent_candles.append(
            {
                "date": str(date.date()),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            }
        )

    return {
        "ticker": ticker,
        "current_price": round(float(info.get("last_price", latest["Close"])), 2),
        "previous_close": round(float(info.get("previous_close", 0)), 2),
        "day_high": round(float(info.get("day_high", latest["High"])), 2),
        "day_low": round(float(info.get("day_low", latest["Low"])), 2),
        "volume": int(latest["Volume"]),
        "recent_candles": recent_candles,
        "note": "Market data is from yfinance and may be delayed."
    }