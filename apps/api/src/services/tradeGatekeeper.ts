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
  assetClass?: string | null;
  direction?: string | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  confidenceScore?: number | null;
  volumeConfirmation?: boolean | null;
  trendStrength?: number | null;
  closedTrades?: ClosedTradeForCooldown[];
};

export type RiskGateCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  threshold: string;
  detail?: string;
};

export type TradeGateEvaluation = {
  approved: boolean;
  reasons: string[];
  checklist: RiskGateCheckItem[];
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
  stopLoss?: number | null,
  options?: { isCrypto?: boolean; precision?: number }
) {
  const maxDollarRisk = (accountBalance * riskPercent) / 100;
  const riskPerShare =
    isPositiveNumber(entryPrice) && isPositiveNumber(stopLoss)
      ? Math.abs(entryPrice - stopLoss)
      : 0;

  let positionSize = 0;
  if (
    Number.isFinite(maxDollarRisk) &&
    maxDollarRisk > 0 &&
    Number.isFinite(riskPerShare) &&
    riskPerShare > 0
  ) {
    const rawSize = maxDollarRisk / riskPerShare;
    if (options?.isCrypto) {
      const precision = options.precision ?? 4;
      positionSize = Number(rawSize.toFixed(precision));
      if (positionSize <= 0 && rawSize > 0) {
        positionSize = Number(rawSize.toFixed(6));
      }
    } else {
      positionSize = Math.floor(rawSize);
    }
  }

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
  const isCrypto =
    candidate.assetClass === "crypto" ||
    candidate.symbol.includes("/") ||
    candidate.symbol.includes("-") ||
    ["BTC", "ETH", "SOL"].includes(candidate.symbol.toUpperCase());
  const riskRewardRatio = calculateRiskReward(candidate.entryPrice, candidate.stopLoss, candidate.takeProfit);
  const position = calculatePositionSize(
    tradeRiskConfig.accountBalance,
    tradeRiskConfig.riskPerTradePercent,
    candidate.entryPrice,
    candidate.stopLoss,
    { isCrypto }
  );
  const reasons: string[] = [];

  const hasEntryPrice = isPositiveNumber(candidate.entryPrice);
  const hasStopLoss = isPositiveNumber(candidate.stopLoss);
  const hasTakeProfit = isPositiveNumber(candidate.takeProfit);
  const validPrices = hasEntryPrice && hasStopLoss && hasTakeProfit;

  if (!hasEntryPrice) {
    reasons.push("Missing entry price");
  }

  if (!hasStopLoss) {
    reasons.push("Missing stop loss");
  }

  if (!hasTakeProfit) {
    reasons.push("Missing take profit");
  }

  const minConfidence = tradeRiskConfig.minConfidenceScore;
  const confidencePassed =
    typeof candidate.confidenceScore === "number" && candidate.confidenceScore >= minConfidence;
  if (!confidencePassed) {
    reasons.push(`Confidence score below ${Math.round(minConfidence * 100)}%`);
  }

  const rrPassed = riskRewardRatio >= tradeRiskConfig.minRiskRewardRatio;
  if (!rrPassed) {
    reasons.push(`Risk/reward below ${tradeRiskConfig.minRiskRewardRatio}:1`);
  }

  const direction = getDirection(candidate.direction);
  let directionPassed = true;
  let directionError: string | undefined;

  if (
    direction === "long" &&
    validPrices &&
    (candidate.takeProfit! <= candidate.entryPrice! || candidate.stopLoss! >= candidate.entryPrice!)
  ) {
    directionPassed = false;
    directionError = "LONG setup requires target above entry and stop below entry";
    reasons.push(directionError);
  }

  if (
    direction === "short" &&
    validPrices &&
    (candidate.takeProfit! >= candidate.entryPrice! || candidate.stopLoss! <= candidate.entryPrice!)
  ) {
    directionPassed = false;
    directionError = "SHORT setup requires target below entry and stop above entry";
    reasons.push(directionError);
  }

  const volumePassed = candidate.volumeConfirmation === true;
  if (!volumePassed) {
    reasons.push("No volume confirmation");
  }

  const positionPassed = position.positionSize > 0;
  if (!positionPassed) {
    reasons.push("Position size could not be calculated");
  }

  const onCooldown = isTickerOnCooldown(candidate.symbol, candidate.closedTrades);
  if (onCooldown) {
    reasons.push("Ticker is on cooldown after a recent loss");
  }

  const checklist: RiskGateCheckItem[] = [
    {
      id: "confidence",
      label: "AI Confidence Score",
      passed: confidencePassed,
      actual:
        typeof candidate.confidenceScore === "number"
          ? `${Math.round(candidate.confidenceScore * 100)}%`
          : "N/A",
      threshold: `>= ${Math.round(minConfidence * 100)}%`,
    },
    {
      id: "riskReward",
      label: "Risk/Reward Ratio",
      passed: rrPassed,
      actual: `${riskRewardRatio.toFixed(2)}:1`,
      threshold: `>= ${tradeRiskConfig.minRiskRewardRatio.toFixed(1)}:1`,
    },
    {
      id: "volume",
      label: "Volume Confirmation",
      passed: volumePassed,
      actual: candidate.volumeConfirmation === true ? "Confirmed (> 1.2x)" : "Unconfirmed",
      threshold: ">= 1.2x volume spike",
    },
    {
      id: "direction",
      label: "Directional Target/Stop",
      passed: directionPassed && validPrices,
      actual:
        validPrices && directionPassed
          ? `${direction.toUpperCase()} aligned`
          : directionError || "Incomplete price levels",
      threshold: "Target & Stop match direction",
    },
    {
      id: "sizing",
      label: "Position Sizing",
      passed: positionPassed,
      actual: positionPassed
        ? `${position.positionSize} units ($${position.maxDollarRisk.toFixed(0)} risk)`
        : "0 units",
      threshold: "Valid position > 0",
    },
    {
      id: "cooldown",
      label: "Loss Cooldown",
      passed: !onCooldown,
      actual: !onCooldown
        ? "Clear (no recent loss)"
        : `Cooling down (${tradeRiskConfig.cooldownHoursAfterLoss}h post-loss)`,
      threshold: `No loss in past ${tradeRiskConfig.cooldownHoursAfterLoss}h`,
    },
  ];

  return {
    approved: reasons.length === 0,
    reasons,
    checklist,
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
