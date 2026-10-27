import { AlpacaBrokerConnector } from "./alpaca";
import { CoinbaseBrokerConnector } from "./coinbase";
import type {
  BrokerAccount,
  BrokerConnector,
  BrokerExecutionMode,
  BrokerOrderResponse,
  BrokerPosition,
  BrokerType,
} from "./types";
import {
  closeTradeEntry,
  getWatchlistEntry,
  KIND_PAPER_TRADE,
  listLedgerEntries,
  type TradeEntry,
  type WatchlistEntry,
} from "../watchlist";
import { evaluateTradeGate } from "../tradeGatekeeper";
import { getDb } from "../db";

const alpacaConnector = new AlpacaBrokerConnector();
const coinbaseConnector = new CoinbaseBrokerConnector();

export function getBrokerConnector(brokerType: BrokerType): BrokerConnector {
  if (brokerType === "COINBASE") return coinbaseConnector;
  return alpacaConnector;
}

export function selectBrokerForSymbol(symbol: string): BrokerConnector {
  const clean = symbol.trim().toUpperCase();
  const isCrypto =
    clean.includes("/") ||
    clean.includes("-") ||
    ["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX"].some(
      (coin) => clean === coin || clean.startsWith(`${coin}/`) || clean.startsWith(`${coin}-`)
    );

  return isCrypto ? coinbaseConnector : alpacaConnector;
}

export async function getBrokerStatus(): Promise<{
  alpaca: BrokerAccount;
  coinbase: BrokerAccount;
  defaultEquitiesBroker: BrokerType;
  defaultCryptoBroker: BrokerType;
  anyConfigured: boolean;
}> {
  const [alpacaAccount, coinbaseAccount] = await Promise.all([
    alpacaConnector.getAccount(),
    coinbaseConnector.getAccount(),
  ]);

  return {
    alpaca: alpacaAccount,
    coinbase: coinbaseAccount,
    defaultEquitiesBroker: "ALPACA",
    defaultCryptoBroker: "COINBASE",
    anyConfigured: alpacaAccount.isConfigured || coinbaseAccount.isConfigured,
  };
}

export type ExecuteBrokerTradeOptions = {
  broker?: BrokerType;
  executionMode?: BrokerExecutionMode;
  quantity?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
};

export async function executeBrokerTrade(
  watchlistEntryOrId: string | WatchlistEntry,
  options: ExecuteBrokerTradeOptions = {}
): Promise<
  | { entry: TradeEntry; order: BrokerOrderResponse }
  | { rejected: true; reasons: string[]; checklist?: unknown }
  | null
> {
  const previousEntry =
    typeof watchlistEntryOrId === "object" && watchlistEntryOrId !== null
      ? watchlistEntryOrId
      : await getWatchlistEntry(watchlistEntryOrId);

  if (!previousEntry) {
    return null;
  }

  const entryPrice = options.entryPrice ?? previousEntry.startPrice ?? null;
  const stopLoss = options.stopLoss ?? previousEntry.stopLoss ?? undefined;
  const takeProfit = options.takeProfit ?? previousEntry.takeProfit ?? undefined;

  // Evaluate risk gate before executing order with broker. Closed trades are
  // included so the post-loss cooldown applies here as it does for paper trades.
  const evaluation = evaluateTradeGate({
    confidenceScore: previousEntry.confidenceScore,
    volumeConfirmation: previousEntry.volumeConfirmation,
    trendStrength: previousEntry.trendStrength,
    entryPrice,
    stopLoss,
    takeProfit,
    direction: previousEntry.direction,
    symbol: previousEntry.symbol,
    closedTrades: process.env.DATABASE_URL ? await listLedgerEntries() : [],
  });

  if (!evaluation.approved) {
    return {
      rejected: true,
      reasons: evaluation.reasons,
      checklist: evaluation.checklist,
    };
  }

  // Select broker connector
  const broker = options.broker
    ? getBrokerConnector(options.broker)
    : selectBrokerForSymbol(previousEntry.symbol);

  const direction = (previousEntry.direction ?? "").toUpperCase();
  const side = direction.includes("BEAR") || direction.includes("SHORT") ? "SELL" : "BUY";
  const qty = options.quantity ?? evaluation.calculated.positionSize;
  // The gate rejects setups without a positive entry price, so this is set here.
  const referencePrice = entryPrice as number;

  // Submit order to broker. limitPrice is the reference price used for
  // simulated fills; live market orders ignore it.
  const order = await broker.submitOrder({
    symbol: previousEntry.symbol,
    side,
    qty,
    type: "MARKET",
    limitPrice: referencePrice,
    stopLoss,
    takeProfit,
    executionMode: options.executionMode || "PAPER",
  });

  const nowIso = new Date().toISOString();
  const fillPrice = order.fillPrice ?? referencePrice;

  // Build trade entry with broker tracking metadata
  const trade: TradeEntry = {
    ...previousEntry,
    status: "Triggered",
    gateStatus: "APPROVED",
    gateReasons: [],
    gateChecklist: evaluation.checklist,
    entryDate: nowIso,
    entryPrice: fillPrice,
    currentPrice: fillPrice,
    currentProfitLoss: 0,
    currentProfitLossPercent: 0,
    quantity: order.filledQty || qty,
    stopLoss: stopLoss ?? null,
    takeProfit: takeProfit ?? null,
    fees: 0,
    slippage: 0,
    stopLossHit: false,
    notes: options.notes || `Executed via ${broker.getBrokerType()} (${order.executionMode} - Order ID: ${order.orderId})`,
    triggeredAt: nowIso,
    triggerPrice: fillPrice,
    triggerReason: `Broker ${broker.getBrokerType()} execution confirmed`,
    updatedAt: nowIso,
  };

  // Add broker-specific properties to the persisted JSON payload
  const extendedTradePayload = {
    ...trade,
    brokerProvider: broker.getBrokerType(),
    brokerOrderId: order.orderId,
    executionMode: order.executionMode,
    brokerStatus: order.status,
    brokerFilledAt: order.filledAt || nowIso,
    brokerFillPrice: fillPrice,
  };

  if (process.env.DATABASE_URL) {
    try {
      const db = await getDb();
      await db.$transaction([
        db.tradeLifecycleEntry.delete({
          where: { id: previousEntry.id },
        }),
        db.tradeLifecycleEntry.create({
          data: {
            id: previousEntry.id,
            kind: KIND_PAPER_TRADE,
            symbol: previousEntry.symbol,
            status: "Triggered",
            ledgerId: null,
            payloadJson: JSON.stringify(extendedTradePayload),
            createdAt: new Date(previousEntry.createdAt),
            updatedAt: new Date(nowIso),
          },
        }),
      ]);
    } catch (err) {
      // The broker order already exists, so losing track of it silently is the
      // worst outcome. Surface the order id so it can be reconciled by hand.
      console.error(
        `Broker order ${order.orderId} (${broker.getBrokerType()}) was placed but could not be saved:`,
        err
      );
      throw new Error(
        `Order ${order.orderId} was placed with ${broker.getBrokerType()} but could not be saved. Reconcile it in the broker dashboard.`
      );
    }
  }

  return { entry: extendedTradePayload as unknown as TradeEntry, order };
}

export async function syncBrokerTrade(tradeId: string): Promise<TradeEntry | null> {
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id: tradeId },
  });

  if (!row) return null;

  try {
    const payload = JSON.parse(row.payloadJson);
    if (!payload.brokerOrderId || !payload.brokerProvider) {
      return payload as TradeEntry;
    }

    const broker = getBrokerConnector(payload.brokerProvider);
    const order = await broker.getOrder(payload.brokerOrderId);

    if (order) {
      payload.brokerStatus = order.status;
      if (order.fillPrice) {
        payload.brokerFillPrice = order.fillPrice;
      }
      payload.updatedAt = new Date().toISOString();

      await db.tradeLifecycleEntry.update({
        where: { id: tradeId },
        data: {
          payloadJson: JSON.stringify(payload),
          updatedAt: new Date(),
        },
      });
    }

    return payload as TradeEntry;
  } catch (err) {
    console.warn("Failed to sync broker trade status:", err);
    return null;
  }
}

export async function closeBrokerTrade(
  tradeId: string,
  outcome: "Win" | "Loss",
  exitPrice?: number
) {
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id: tradeId },
  });

  if (row) {
    const payload = JSON.parse(row.payloadJson);
    if (payload.brokerOrderId && payload.brokerProvider) {
      const broker = getBrokerConnector(payload.brokerProvider);
      // Cancel any still-open entry/bracket legs first (best effort), then
      // flatten the position. Cancelling alone leaves a filled position open.
      await broker.cancelOrder(payload.brokerOrderId).catch(() => false);

      const direction = String(payload.direction ?? "").toUpperCase();
      const side = direction.includes("BEAR") || direction.includes("SHORT") ? "SELL" : "BUY";
      const closed = await broker.closePosition(payload.symbol, side, Number(payload.quantity) || 0);
      if (!closed) {
        throw new Error(
          `Could not close the ${payload.symbol} position with ${payload.brokerProvider}; the trade was left open.`
        );
      }
    }
  }

  // Close the trade record and move to Trust Ledger
  return await closeTradeEntry(tradeId, outcome, {
    exitPrice,
    notes: `Closed with broker exit reconciliation`,
  });
}
