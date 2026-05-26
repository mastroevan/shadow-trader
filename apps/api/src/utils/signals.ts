// apps/api/src/utils/signals.ts

import type { FinnhubQuote } from "../services/finnhub.ts";

export type MarketSignal = {
    type:
    | "PRICE_CHANGE"
    | "INTRADAY_RANGE"
    | "GAP_FROM_OPEN"
    | "SMA_TREND"
    | "QUOTE_HEALTH"
    | "NEWS_SENTIMENT";
    label: string;
    value: number | string;
    interpretation: string;
};

export type NewsItem = {
    headline?: string;
    summary?: string;
};

type GenerateSignalsInput = {
    quote: FinnhubQuote;
    news?: NewsItem[];
    technicals?: {
        sma20: number | null;
        closeCount: number;
    } | null;
};

export function generateSignals({
    quote,
    news = [],
    technicals = null,
}: GenerateSignalsInput): MarketSignal[] {
    const signals: MarketSignal[] = [];

    const price = quote.price;
    const previousClose = quote.previousClose;
    const open = quote.open;
    const high = quote.high;
    const low = quote.low;

    if (price > 0 && previousClose > 0) {
        const changePct = ((price - previousClose) / previousClose) * 100;

        signals.push({
            type: "PRICE_CHANGE",
            label: "Price change vs previous close",
            value: Number(changePct.toFixed(2)),
            interpretation:
                changePct > 2
                    ? "Strong upward move versus previous close"
                    : changePct < -2
                        ? "Strong downward move versus previous close"
                        : "Relatively flat move versus previous close",
        });
    }

    if (high > 0 && low > 0 && price > 0) {
        const intradayRangePct = ((high - low) / price) * 100;

        signals.push({
            type: "INTRADAY_RANGE",
            label: "Intraday trading range",
            value: Number(intradayRangePct.toFixed(2)),
            interpretation:
                intradayRangePct > 5
                    ? "Large intraday range suggests elevated volatility"
                    : "Intraday range appears normal",
        });
    }

    if (price > 0 && open > 0) {
        const gapFromOpenPct = ((price - open) / open) * 100;

        signals.push({
            type: "GAP_FROM_OPEN",
            label: "Move from open",
            value: Number(gapFromOpenPct.toFixed(2)),
            interpretation:
                gapFromOpenPct > 1
                    ? "Price is trading above the open"
                    : gapFromOpenPct < -1
                        ? "Price is trading below the open"
                        : "Price is close to the open",
        });
    }

    if (price > 0 && technicals?.sma20 && technicals.sma20 > 0) {
        const distancePct = ((price - technicals.sma20) / technicals.sma20) * 100;

        signals.push({
            type: "SMA_TREND",
            label: "20-day SMA trend",
            value: Number(distancePct.toFixed(2)),
            interpretation:
                distancePct > 1
                    ? `Price is above the 20-day SMA of $${technicals.sma20.toFixed(2)}, a bullish trend signal`
                    : distancePct < -1
                        ? `Price is below the 20-day SMA of $${technicals.sma20.toFixed(2)}, a bearish trend signal`
                        : `Price is near the 20-day SMA of $${technicals.sma20.toFixed(2)}, suggesting a neutral trend`,
        });
    }

    signals.push({
        type: "QUOTE_HEALTH",
        label: "Quote health",
        value: quote.timestamp > 0 ? "valid" : "stale_or_missing",
        interpretation:
            quote.timestamp > 0
                ? "Finnhub returned a valid quote timestamp"
                : "Quote timestamp is missing or stale",
    });

    if (news.length > 0) {
        const sentimentScore = scoreNewsSentiment(news);

        signals.push({
            type: "NEWS_SENTIMENT",
            label: "Recent news sentiment",
            value: sentimentScore,
            interpretation:
                sentimentScore > 0
                    ? "Recent headlines skew positive"
                    : sentimentScore < 0
                        ? "Recent headlines skew negative"
                        : "Recent headlines appear neutral",
        });
    }

    return signals;
}

function scoreNewsSentiment(news: NewsItem[]): number {
    const positiveWords = [
        "beat",
        "beats",
        "record revenue",
        "record",
        "growth",
        "upgrade",
        "upgrades",
        "surge",
        "surges",
        "strong",
        "profit",
        "profits",
        "bullish",
        "raises",
        "raised guidance",
        "guidance raised",
        "partnership",
        "expansion",
        "ai demand",
        "demand",
        "outperform",
    ];

    const negativeWords = [
        "miss",
        "misses",
        "lawsuit",
        "investigation",
        "downgrade",
        "downgrades",
        "drop",
        "drops",
        "weak",
        "weak demand",
        "loss",
        "losses",
        "bearish",
        "cuts",
        "guidance cut",
        "cut guidance",
        "warning",
        "layoffs",
        "decline",
        "declines",
        "underperform",
    ];

    let score = 0;

    for (const item of news) {
        const text = `${item.headline ?? ""} ${item.summary ?? ""}`.toLowerCase();

        for (const word of positiveWords) {
            if (text.includes(word)) score += 1;
        }

        for (const word of negativeWords) {
            if (text.includes(word)) score -= 1;
        }
    }

    return score;
}
