import { getFinnhubQuote } from "./finnhub";
import {
  closeTradeEntry,
  listTradeEntries,
  listWatchlistEntries,
  markWatchlistEntryPendingConfirmation,
  updatePaperTradeEntry,
  type TradeEntry,
  type WatchlistEntry,
} from "./watchlist";
import { getCryptoQuote } from "./marketSnapshot/crypto";
import { resolveInstrument } from "../utils/symbols";

export type AutomationAction =
  | {
      type: "ENTRY_TRIGGERED";
      symbol: string;
      entryId: string;
      price: number;
      reason: string;
    }
  | {
      type: "ENTRY_TRIGGER_INVALID";
      symbol: string;
      entryId: string;
      price: number;
      reason: string;
    }
  | {
      type: "EXIT_TRIGGERED";
      symbol: string;
      entryId: string;
      price: number;
      outcome: "Win" | "Loss";
      reason: string;
    }
  | {
      type: "PRICE_MARKED";
      symbol: string;
      entryId: string;
      price: number;
    }
  | {
      type: "STOP_LOSS_HIT";
      symbol: string;
      entryId: string;
      price: number;
      reason: string;
    };

export type AutomationRunResult = {
  ranAt: string;
  scanned: {
    watchlist: number;
    paperTrades: number;
  };
  actions: AutomationAction[];
  errors: Array<{
    symbol: string;
    message: string;
  }>;
};

const DEFAULT_ENTRY_MOVE_PCT = 0.01;

export async function runTriggerAutomation(): Promise<AutomationRunResult> {
  const ranAt = new Date().toISOString();
  const [watchlistEntries, tradeEntries] = await Promise.all([
    listWatchlistEntries(),
    listTradeEntries(),
  ]);
  const result: AutomationRunResult = {
    ranAt,
    scanned: {
      watchlist: watchlistEntries.length,
      paperTrades: tradeEntries.length,
    },
    actions: [],
    errors: [],
  };

  for (const entry of watchlistEntries) {
    try {
      if (entry.status !== "Watching") continue;

      const price = await getLatestPrice(entry.symbol);
      const trigger = evaluateEntryTrigger(entry, price);

      if (!trigger.triggered) continue;

      const levels = getTradeLevels(entry, price);
      const pending = await markWatchlistEntryPendingConfirmation(entry.id, {
        triggerPrice: price,
        triggerReason: trigger.reason,
      });

      if (pending) {
        await sendTriggerNotification(pending, levels);
        result.actions.push({
          type: "ENTRY_TRIGGERED",
          symbol: entry.symbol,
          entryId: entry.id,
          price,
          reason: trigger.reason,
        });
      }
    } catch (error) {
      result.errors.push(errorFor(entry.symbol, error));
    }
  }

  for (const trade of tradeEntries) {
    try {
      const price = await getLatestPrice(trade.symbol);
      const marked = await updatePaperTradeEntry(trade.id, {
        currentPrice: price,
      });
      const currentTrade = marked ?? trade;
      const exit = evaluateExitTrigger(currentTrade, price);

      if (currentTrade.stopLossHit) {
        result.actions.push({
          type: "STOP_LOSS_HIT",
          symbol: trade.symbol,
          entryId: trade.id,
          price,
          reason: exit.reason || `price ${formatPrice(price)} reached stop ${formatPrice(currentTrade.stopLoss)}`,
        });
        continue;
      }

      if (!exit.triggered) {
        result.actions.push({
          type: "PRICE_MARKED",
          symbol: trade.symbol,
          entryId: trade.id,
          price,
        });
        continue;
      }

      const closed = await closeTradeEntry(trade.id, exit.outcome, {
        exitPrice: price,
        notes: `Automation closed this paper trade: ${exit.reason}`,
      });

      if (closed) {
        result.actions.push({
          type: "EXIT_TRIGGERED",
          symbol: trade.symbol,
          entryId: trade.id,
          price,
          outcome: exit.outcome,
          reason: exit.reason,
        });
      }
    } catch (error) {
      result.errors.push(errorFor(trade.symbol, error));
    }
  }

  return result;
}

function evaluateEntryTrigger(entry: WatchlistEntry, price: number) {
  const direction = getDirection(entry.direction);
  const explicitLevel = selectEntryLevel(entry, direction);

  if (explicitLevel !== null) {
    const crossed =
      direction === "short" ? price <= explicitLevel : price >= explicitLevel;

    return {
      triggered: crossed,
      reason: crossed
        ? `price ${formatPrice(price)} crossed entry level ${formatPrice(explicitLevel)}`
        : "",
    };
  }

  if (typeof entry.startPrice !== "number" || entry.startPrice <= 0) {
    return { triggered: false, reason: "" };
  }

  const threshold = getEntryMovePct();
  const triggerPrice =
    direction === "short"
      ? entry.startPrice * (1 - threshold)
      : entry.startPrice * (1 + threshold);
  const crossed = direction === "short" ? price <= triggerPrice : price >= triggerPrice;

  return {
    triggered: crossed,
    reason: crossed
      ? `price ${formatPrice(price)} moved ${formatPercent(threshold)} in the thesis direction from start price ${formatPrice(entry.startPrice)}`
      : "",
  };
}

function evaluateExitTrigger(trade: TradeEntry, price: number) {
  const direction = getDirection(trade.direction);

  if (typeof trade.takeProfit === "number") {
    const hitTarget =
      direction === "short" ? price <= trade.takeProfit : price >= trade.takeProfit;

    if (hitTarget) {
      return {
        triggered: true,
        outcome: "Win" as const,
        reason: `price ${formatPrice(price)} reached target ${formatPrice(trade.takeProfit)}`,
      };
    }
  }

  if (typeof trade.stopLoss === "number") {
    const hitStop =
      direction === "short" ? price >= trade.stopLoss : price <= trade.stopLoss;

    if (hitStop) {
      return {
        triggered: true,
        outcome: "Loss" as const,
        reason: `price ${formatPrice(price)} reached stop ${formatPrice(trade.stopLoss)}`,
      };
    }
  }

  return { triggered: false, outcome: "Loss" as const, reason: "" };
}

function getTradeLevels(entry: WatchlistEntry, triggerPrice: number) {
  return {
    entryPrice: triggerPrice,
    stop: parsePriceLevels(entry.stopLossTrigger)[0] ?? null,
    target: parsePriceLevels(entry.takeProfitTrigger)[0] ?? null,
  };
}

async function sendTriggerNotification(
  entry: WatchlistEntry,
  levels: { entryPrice: number; stop: number | null; target: number | null }
) {
  const message = [
    `Trade setup triggered: ${entry.symbol}`,
    `Entry: ${formatPrice(levels.entryPrice)} | Stop: ${formatPrice(levels.stop)} | Target: ${formatPrice(levels.target)}`,
  ].join("\n");

  try {
    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      });
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    const to = process.env.TWILIO_TO_NUMBER;

    if (accountSid && authToken && from && to) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: from,
          To: to,
          Body: message,
        }),
      });
    }
  } catch (error) {
    console.warn(`Trigger notification failed for ${entry.symbol}:`, error);
  }
}

async function getLatestPrice(symbol: string): Promise<number> {
  const instrument = resolveInstrument({ symbol });
  const quote =
    instrument.assetClass === "crypto"
      ? await getCryptoQuote(instrument)
      : await getFinnhubQuote(instrument.symbol);

  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    throw new Error(`No valid market price returned for ${symbol}.`);
  }

  return quote.price;
}

function selectEntryLevel(entry: WatchlistEntry, direction: "long" | "short") {
  const levels = [
    ...parsePriceLevels(entry.entryTrigger),
    ...parsePriceLevels(entry.entryZone),
  ];

  if (levels.length === 0) return null;

  if (typeof entry.startPrice !== "number" || entry.startPrice <= 0) {
    return levels[0];
  }

  const startPrice = entry.startPrice;
  const directionalLevels = levels.filter((level) =>
    direction === "short" ? level <= startPrice : level >= startPrice
  );
  const candidates = directionalLevels.length > 0 ? directionalLevels : levels;
  if (directionalLevels.length === 0) return null;

  return candidates.reduce((closest, level) =>
    Math.abs(level - startPrice) < Math.abs(closest - startPrice)
      ? level
      : closest
  );
}

function parsePriceLevels(value?: string): number[] {
  if (!value) return [];

  const matches = value.matchAll(/\$?\b\d+(?:,\d{3})*(?:\.\d+)?\b/g);
  const levels: number[] = [];

  for (const match of matches) {
    const raw = match[0];
    const nextCharacter = value[Number(match.index) + raw.length]?.toLowerCase();

    if (nextCharacter === "%" || nextCharacter === "r" || nextCharacter === "x") {
      continue;
    }

    const level = Number(raw.replace(/[$,]/g, ""));

    if (Number.isFinite(level) && level > 0) {
      levels.push(level);
    }
  }

  return levels;
}

function getDirection(direction: string): "long" | "short" {
  const normalized = direction.toUpperCase();

  return normalized.includes("BEAR") || normalized.includes("SHORT") ? "short" : "long";
}

function getEntryMovePct() {
  const configured = Number(process.env.AUTOMATION_ENTRY_MOVE_PCT);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ENTRY_MOVE_PCT;
}

function errorFor(symbol: string, error: unknown) {
  return {
    symbol,
    message: error instanceof Error ? error.message : "Automation failed.",
  };
}

function formatPrice(price: number | null) {
  if (typeof price !== "number") return "N/A";

  return `$${price.toFixed(price >= 10 ? 2 : 4)}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
