export const tradeRiskConfig = {
  accountBalance: readNumber("ACCOUNT_BALANCE", 10_000),
  riskPerTradePercent: readNumber("RISK_PER_TRADE_PERCENT", 1),
  minRiskRewardRatio: readNumber("MIN_RISK_REWARD_RATIO", 2),
  minConfidenceScore: readNumber("MIN_CONFIDENCE_SCORE", 0.75),
  minVolumeRatio: readNumber("MIN_VOLUME_RATIO", 1.2),
  minTrendStrength: readNumber("MIN_TREND_STRENGTH", 0.6),
  cooldownHoursAfterLoss: readNumber("COOLDOWN_HOURS_AFTER_LOSS", 24),
};

function readNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) ? value : fallback;
}
