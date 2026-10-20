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
  type TradeEntry,
  type WatchlistEntry,
  updatePaperTradeEntry,
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

  // Evaluate risk gate before executing order with broker
  const evaluation = evaluateTradeGate({
    confidenceScore: previousEntry.confidenceScore,
    volumeConfirmation: previousEntry.volumeConfirmation,
    trendStrength: previousEntry.trendStrength,
    entryPrice: options.entryPrice ?? previousEntry.startPrice,
    stopLoss: options.stopLoss ?? previousEntry.stopLoss,
    takeProfit: options.takeProfit ?? previousEntry.takeProfit,
    direction: previousEntry.direction,
    symbol: previousEntry.symbol,
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

  const direction = previousEntry.direction.toUpperCase();
  const side = direction.includes("BEAR") || direction === "SHORT" ? "SELL" : "BUY";
  const qty = options.quantity ?? evaluation.calculated.positionSize ?? 1;
  const entryPrice = options.entryPrice ?? previousEntry.startPrice ?? 100;
  const stopLoss = options.stopLoss ?? previousEntry.stopLoss ?? undefined;
  const takeProfit = options.takeProfit ?? previousEntry.takeProfit ?? undefined;

  // Submit order to broker
  const order = await broker.submitOrder({
    symbol: previousEntry.symbol,
    side,
    qty,
    type: "MARKET",
    limitPrice: entryPrice,
    stopLoss,
    takeProfit,
    executionMode: options.executionMode || "PAPER",
  });

  const nowIso = new Date().toISOString();
  const fillPrice = order.fillPrice ?? entryPrice;

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
            kind: "paper_trade",
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
      console.warn("DB persistence skipped for broker trade:", err);
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
  // Sync status and cancel any remaining open broker order
  const db = await getDb();
  const row = await db.tradeLifecycleEntry.findUnique({
    where: { id: tradeId },
  });

  if (row) {
    try {
      const payload = JSON.parse(row.payloadJson);
      if (payload.brokerOrderId && payload.brokerProvider) {
        const broker = getBrokerConnector(payload.brokerProvider);
        await broker.cancelOrder(payload.brokerOrderId);
      }
    } catch {
      // Best effort cancellation
    }
  }

  // Close the trade record and move to Trust Ledger
  return await closeTradeEntry(tradeId, outcome, {
    exitPrice,
    notes: `Closed with broker exit reconciliation`,
  });
}
