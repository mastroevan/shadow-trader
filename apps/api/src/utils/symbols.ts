// apps/api/src/utils/symbols.ts

const ALIASES: Record<string, string> = {
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

export function normalizeSymbol(input: string): string {
  const cleaned = input.trim();

  if (!cleaned) {
    return "";
  }

  const key = cleaned.toLowerCase();

  return ALIASES[key] || cleaned.toUpperCase();
}

export function getAliasSuggestion(
  input: string
): string | null {
  const key = input.trim().toLowerCase();

  return ALIASES[key] || null;
}