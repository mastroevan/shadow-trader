import { tradeRiskConfig } from "./tradeRiskConfig";

export type GateStatus = "APPROVED" | "REJECTED";

export type ClosedTradeForCooldown = {
  symbol: string;
  outcome?: "Win" | "Loss";
  exitDate?: string;
  closedAt?: string;
  updatedAt?: string;
};

export type TradeGateCandidate = {
  symbol: string;
  direction?: string | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  confidenceScore?: number | null;
  volumeConfirmation?: boolean | null;
  trendStrength?: number | null;
  closedTrades?: ClosedTradeForCooldown[];
};

export type TradeGateEvaluation = {
  approved: boolean;
  reasons: string[];
  calculated: {
    riskRewardRatio: number;
    positionSize: number;
    maxDollarRisk: number;
    riskPerShare: number;
  };
};

export function calculateRiskReward(
  entryPrice?: number | null,
  stopLoss?: number | null,
  takeProfit?: number | null
) {
  if (!isPositiveNumber(entryPrice) || !isPositiveNumber(stopLoss) || !isPositiveNumber(takeProfit)) {
    return 0;
  }

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);

  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(reward) || reward <= 0) {
    return 0;
  }

  return reward / risk;
}

export function calculatePositionSize(
  accountBalance: number,
  riskPercent: number,
  entryPrice?: number | null,
  stopLoss?: number | null
) {
  const maxDollarRisk = accountBalance * riskPercent / 100;
  const riskPerShare =
    isPositiveNumber(entryPrice) && isPositiveNumber(stopLoss)
      ? Math.abs(entryPrice - stopLoss)
      : 0;
  const positionSize =
    Number.isFinite(maxDollarRisk) && maxDollarRisk > 0 && Number.isFinite(riskPerShare) && riskPerShare > 0
      ? Math.floor(maxDollarRisk / riskPerShare)
      : 0;

  return {
    positionSize,
    maxDollarRisk: Number.isFinite(maxDollarRisk) && maxDollarRisk > 0 ? maxDollarRisk : 0,
    riskPerShare,
  };
}

export function isTickerOnCooldown(
  symbol: string,
  closedTrades: ClosedTradeForCooldown[] = [],
  now = new Date()
) {
  const normalizedSymbol = symbol.toUpperCase();
  const latestClosedTrade = closedTrades
    .filter((trade) => trade.symbol.toUpperCase() === normalizedSymbol)
    .map((trade) => ({
      trade,
      closedAt: new Date(trade.closedAt ?? trade.exitDate ?? trade.updatedAt ?? 0),
    }))
    .filter(({ closedAt }) => Number.isFinite(closedAt.getTime()))
    .sort((left, right) => right.closedAt.getTime() - left.closedAt.getTime())[0];

  if (!latestClosedTrade || latestClosedTrade.trade.outcome !== "Loss") return false;

  const elapsedMs = now.getTime() - latestClosedTrade.closedAt.getTime();
  const cooldownMs = tradeRiskConfig.cooldownHoursAfterLoss * 60 * 60 * 1000;

  return elapsedMs >= 0 && elapsedMs < cooldownMs;
}

export function evaluateTradeGate(candidate: TradeGateCandidate): TradeGateEvaluation {
  const riskRewardRatio = calculateRiskReward(candidate.entryPrice, candidate.stopLoss, candidate.takeProfit);
  const position = calculatePositionSize(
    tradeRiskConfig.accountBalance,
    tradeRiskConfig.riskPerTradePercent,
    candidate.entryPrice,
    candidate.stopLoss
  );
  const reasons: string[] = [];

  if (!isPositiveNumber(candidate.entryPrice)) {
    reasons.push("Missing entry price");
  }

  if (!isPositiveNumber(candidate.stopLoss)) {
    reasons.push("Missing stop loss");
  }

  if (!isPositiveNumber(candidate.takeProfit)) {
    reasons.push("Missing take profit");
  }

  if (typeof candidate.confidenceScore !== "number" || candidate.confidenceScore < tradeRiskConfig.minConfidenceScore) {
    reasons.push(`Confidence score below ${Math.round(tradeRiskConfig.minConfidenceScore * 100)}%`);
  }

  if (riskRewardRatio < tradeRiskConfig.minRiskRewardRatio) {
    reasons.push(`Risk/reward below ${tradeRiskConfig.minRiskRewardRatio}:1`);
  }

  const direction = getDirection(candidate.direction);
  if (
    direction === "long" &&
    isPositiveNumber(candidate.entryPrice) &&
    isPositiveNumber(candidate.stopLoss) &&
    isPositiveNumber(candidate.takeProfit) &&
    (candidate.takeProfit <= candidate.entryPrice || candidate.stopLoss >= candidate.entryPrice)
  ) {
    reasons.push("LONG setup requires target above entry and stop below entry");
  }

  if (
    direction === "short" &&
    isPositiveNumber(candidate.entryPrice) &&
    isPositiveNumber(candidate.stopLoss) &&
    isPositiveNumber(candidate.takeProfit) &&
    (candidate.takeProfit >= candidate.entryPrice || candidate.stopLoss <= candidate.entryPrice)
  ) {
    reasons.push("SHORT setup requires target below entry and stop above entry");
  }

  if (candidate.volumeConfirmation !== true) {
    reasons.push("No volume confirmation");
  }

  if (position.positionSize <= 0) {
    reasons.push("Position size could not be calculated");
  }

  if (isTickerOnCooldown(candidate.symbol, candidate.closedTrades)) {
    reasons.push("Ticker is on cooldown after a recent loss");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    calculated: {
      riskRewardRatio,
      positionSize: position.positionSize,
      maxDollarRisk: position.maxDollarRisk,
      riskPerShare: position.riskPerShare,
    },
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getDirection(direction?: string | null): "long" | "short" {
  const normalized = direction?.toUpperCase() ?? "";

  return normalized.includes("BEAR") || normalized.includes("SHORT") ? "short" : "long";
}
