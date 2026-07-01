// apps/api/src/utils/symbols.ts

import type { AssetClass, Instrument, Timeframe } from "../types/market";

const STOCK_ALIASES: Record<string, string> = {
  amazon: "AMZN",
  aws: "AMZN",

  google: "GOOGL",
  alphabet: "GOOGL",

  meta: "META",
  facebook: "META",

  tesla: "TSLA",

  nvidia: "NVDA",

  apple: "AAPL",

  microsoft: "MSFT",
};

const CRYPTO_ALIASES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  dogecoin: "DOGE",
  doge: "DOGE",
  cardano: "ADA",
  ada: "ADA",
  ripple: "XRP",
  xrp: "XRP",
  litecoin: "LTC",
  ltc: "LTC",
  chainlink: "LINK",
  link: "LINK",
  avalanche: "AVAX",
  avax: "AVAX",
  polygon: "MATIC",
  matic: "MATIC",
};

const KNOWN_CRYPTO_ASSETS = new Set(Object.values(CRYPTO_ALIASES));
const KNOWN_QUOTE_ASSETS = ["USD", "USDT", "USDC", "EUR", "BTC", "ETH"];

export function normalizeSymbol(input: string): string {
  const cleaned = input.trim();

  if (!cleaned) {
    return "";
  }

  const key = cleaned.toLowerCase();

  return STOCK_ALIASES[key] || cleaned.toUpperCase();
}

export function getAliasSuggestion(
  input: string
): string | null {
  const key = input.trim().toLowerCase();

  return STOCK_ALIASES[key] || CRYPTO_ALIASES[key] || null;
}

export function resolveInstrument(input: {
  symbol: string;
  assetClass?: unknown;
  exchange?: unknown;
  timeframe?: unknown;
}): Instrument {
  const cleaned = input.symbol.trim();
  const requestedAssetClass = normalizeAssetClass(input.assetClass);
  const timeframe = normalizeTimeframe(input.timeframe);

  if (!cleaned) {
    return {
      assetClass: requestedAssetClass ?? "stock",
      symbol: "",
      displaySymbol: "",
      exchange: normalizeExchange(input.exchange),
      timeframe,
    };
  }

  const cryptoPair = parseCryptoPair(cleaned);

  if (requestedAssetClass === "crypto" || (!requestedAssetClass && cryptoPair)) {
    const pair = cryptoPair ?? {
      baseAsset: normalizeCryptoAsset(cleaned),
      quoteAsset: "USD",
    };
    const symbol = `${pair.baseAsset}-${pair.quoteAsset}`;

    return {
      assetClass: "crypto",
      symbol,
      displaySymbol: `${pair.baseAsset}/${pair.quoteAsset}`,
      baseAsset: pair.baseAsset,
      quoteAsset: pair.quoteAsset,
      exchange: normalizeExchange(input.exchange) ?? "coinbase",
      timeframe,
    };
  }

  const symbol = normalizeSymbol(cleaned);

  return {
    assetClass: "stock",
    symbol,
    displaySymbol: symbol,
    exchange: normalizeExchange(input.exchange),
    timeframe,
  };
}

function normalizeAssetClass(value: unknown): AssetClass | null {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "stock" || normalized === "stocks" || normalized === "equity") {
    return "stock";
  }

  if (normalized === "crypto" || normalized === "cryptocurrency") {
    return "crypto";
  }

  return null;
}

function normalizeTimeframe(value: unknown): Timeframe {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["1m", "5m", "15m", "1h", "1d"].includes(normalized)) {
    return normalized as Timeframe;
  }

  return "5m";
}

function normalizeExchange(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();

  return normalized || undefined;
}

function parseCryptoPair(input: string): { baseAsset: string; quoteAsset: string } | null {
  const normalized = input.trim().toUpperCase().replace(/\s+/g, "");
  const key = normalized.toLowerCase();

  if (CRYPTO_ALIASES[key]) {
    return {
      baseAsset: CRYPTO_ALIASES[key],
      quoteAsset: "USD",
    };
  }

  const separated = normalized.match(/^([A-Z0-9]+)[/-]([A-Z0-9]+)$/);
  if (separated) {
    return {
      baseAsset: normalizeCryptoAsset(separated[1]),
      quoteAsset: normalizeCryptoAsset(separated[2]),
    };
  }

  for (const quoteAsset of KNOWN_QUOTE_ASSETS) {
    if (normalized.endsWith(quoteAsset) && normalized.length > quoteAsset.length) {
      const baseAsset = normalized.slice(0, -quoteAsset.length);

      if (KNOWN_CRYPTO_ASSETS.has(baseAsset)) {
        return {
          baseAsset,
          quoteAsset,
        };
      }
    }
  }

  return KNOWN_CRYPTO_ASSETS.has(normalized)
    ? { baseAsset: normalized, quoteAsset: "USD" }
    : null;
}

function normalizeCryptoAsset(value: string): string {
  return CRYPTO_ALIASES[value.trim().toLowerCase()] ?? value.trim().toUpperCase();
}
