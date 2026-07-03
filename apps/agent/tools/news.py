from langchain_core.tools import tool
import os
import requests


@tool
def get_company_news(ticker: str) -> dict:
    """
    Get recent company news headlines for a ticker.

    Use this when the user asks about news, catalysts, sentiment,
    earnings, headlines, or why a stock may be moving.

    Args:
        ticker: Stock ticker symbol such as TSLA, NVDA, AAPL, META, or AMZN.

    Returns:
        Dictionary containing recent news headlines if a Finnhub API key is available.
    """
    ticker = ticker.upper().strip()
    api_key = os.getenv("FINNHUB_API_KEY")

    if not api_key:
        return {
            "ticker": ticker,
            "headlines": [],
            "note": "No FINNHUB_API_KEY found. Add one to .env to enable company news."
        }

    url = "https://finnhub.io/api/v1/company-news"
    params = {
        "symbol": ticker,
        "from": "2026-06-01",
        "to": "2026-07-02",
        "token": api_key,
    }

    response = requests.get(url, params=params, timeout=10)

    if response.status_code != 200:
        return {
            "ticker": ticker,
            "error": f"Finnhub request failed with status {response.status_code}",
        }

    articles = response.json()[:5]

    headlines = []

    for article in articles:
        headlines.append(
            {
                "headline": article.get("headline"),
                "source": article.get("source"),
                "url": article.get("url"),
                "summary": article.get("summary"),
            }
        )

    return {
        "ticker": ticker,
        "headlines": headlines,
        "note": "News data comes from Finnhub if configured."
    }