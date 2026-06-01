import { createAlertOnce } from "./alerts";
import { getFinnhubQuote, isValidFinnhubQuote } from "./finnhub";
import {
  listThesisRecords,
  ThesisRecord,
  updateThesisAutomation,
  updateThesisOutcome,
} from "./theses";

export type MonitorRunSummary = {
  checkedAt: string;
  checked: number;
  alertsCreated: number;
  expired: number;
  errors: Array<{
    symbol: string;
    message: string;
  }>;
};

export async function monitorActiveTheses(): Promise<MonitorRunSummary> {
  const checkedAt = new Date().toISOString();
  const records = await listThesisRecords();
  const activeRecords = records.filter((record) => record.status === "ACTIVE");
  const summary: MonitorRunSummary = {
    checkedAt,
    checked: 0,
    alertsCreated: 0,
    expired: 0,
    errors: [],
  };

  for (const record of activeRecords) {
    summary.checked += 1;

    try {
      const expiryAlertCreated = await expireIfNeeded(record, checkedAt);
      if (expiryAlertCreated) {
        summary.alertsCreated += 1;
        summary.expired += 1;
        continue;
      }

      const quote = await getFinnhubQuote(record.symbol);
      if (!isValidFinnhubQuote(quote)) {
        continue;
      }

      const initialPrice = record.initialPrice;
      const priceChangePct =
        initialPrice && initialPrice > 0
          ? ((quote.price - initialPrice) / initialPrice) * 100
          : null;
      let latestAlertId: string | null = null;
      const signal = classifyThesisMove(record, priceChangePct);

      if (signal) {
        const alert = await createAlertOnce({
          thesisRecordId: record.id,
          symbol: record.symbol,
          type: signal.type,
          severity: signal.severity,
          title: signal.title,
          message: signal.message,
          metadata: {
            direction: record.direction,
            initialPrice,
            currentPrice: quote.price,
            priceChangePct,
            checkedAt,
          },
        });

        if (alert) {
          latestAlertId = alert.id;
          summary.alertsCreated += 1;
        }
      }

      await updateThesisAutomation(record.id, {
        lastCheckedAt: checkedAt,
        lastPrice: quote.price,
        priceChangePct: priceChangePct === null ? null : Number(priceChangePct.toFixed(2)),
        latestAlertId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown monitor error";
      summary.errors.push({ symbol: record.symbol, message });

      const alert = await createAlertOnce({
        thesisRecordId: record.id,
        symbol: record.symbol,
        type: "MONITORING_ERROR",
        severity: "LOW",
        title: `Monitoring failed for ${record.symbol}`,
        message,
        metadata: {
          checkedAt,
        },
      });

      if (alert) {
        summary.alertsCreated += 1;
      }
    }
  }

  return summary;
}

async function expireIfNeeded(record: ThesisRecord, checkedAt: string) {
  if (new Date(record.expiresAt).getTime() > Date.now()) {
    return false;
  }

  await updateThesisOutcome(record.id, {
    status: "EXPIRED",
    finalPrice: record.automation?.lastPrice ?? null,
    notes: "Automatically expired after the thesis review window elapsed.",
  });

  const alert = await createAlertOnce({
    thesisRecordId: record.id,
    symbol: record.symbol,
    type: "THESIS_EXPIRED",
    severity: "MEDIUM",
    title: `${record.symbol} thesis expired`,
    message: "The thesis reached its review window without being resolved.",
    metadata: {
      expiresAt: record.expiresAt,
      checkedAt,
    },
  });

  return Boolean(alert);
}

function classifyThesisMove(
  record: ThesisRecord,
  priceChangePct: number | null
):
  | {
      type: "THESIS_TRIGGERED" | "THESIS_INVALIDATED";
      severity: "MEDIUM" | "HIGH";
      title: string;
      message: string;
    }
  | null {
  if (priceChangePct === null) {
    return null;
  }

  const direction = record.direction.toUpperCase();

  if (direction.includes("BULL")) {
    if (priceChangePct >= 2) {
      return {
        type: "THESIS_TRIGGERED",
        severity: priceChangePct >= 5 ? "HIGH" : "MEDIUM",
        title: `${record.symbol} bullish thesis triggered`,
        message: `Price is ${priceChangePct.toFixed(2)}% above the thesis start price.`,
      };
    }

    if (priceChangePct <= -3) {
      return {
        type: "THESIS_INVALIDATED",
        severity: priceChangePct <= -5 ? "HIGH" : "MEDIUM",
        title: `${record.symbol} bullish thesis at risk`,
        message: `Price is ${Math.abs(priceChangePct).toFixed(2)}% below the thesis start price.`,
      };
    }
  }

  if (direction.includes("BEAR")) {
    if (priceChangePct <= -2) {
      return {
        type: "THESIS_TRIGGERED",
        severity: priceChangePct <= -5 ? "HIGH" : "MEDIUM",
        title: `${record.symbol} bearish thesis triggered`,
        message: `Price is ${Math.abs(priceChangePct).toFixed(2)}% below the thesis start price.`,
      };
    }

    if (priceChangePct >= 3) {
      return {
        type: "THESIS_INVALIDATED",
        severity: priceChangePct >= 5 ? "HIGH" : "MEDIUM",
        title: `${record.symbol} bearish thesis at risk`,
        message: `Price is ${priceChangePct.toFixed(2)}% above the thesis start price.`,
      };
    }
  }

  return null;
}
