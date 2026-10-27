import { randomUUID } from "node:crypto";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import type {
  BrokerAccount,
  BrokerConnector,
  BrokerOrderRequest,
  BrokerOrderResponse,
  BrokerPosition,
  BrokerType,
} from "./types";

export class AlpacaBrokerConnector implements BrokerConnector {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;
  private isLive: boolean;

  constructor() {
    this.apiKey = process.env.ALPACA_API_KEY_ID || "";
    this.secretKey = process.env.ALPACA_API_SECRET_KEY || "";
    this.isLive = (process.env.ALPACA_EXECUTION_MODE || "paper").toLowerCase() === "live";
    this.baseUrl =
      process.env.ALPACA_BASE_URL ||
      (this.isLive ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets");
  }

  getBrokerType(): BrokerType {
    return "ALPACA";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey);
  }

  private getHeaders(): Record<string, string> {
    return {
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.secretKey,
      "Content-Type": "application/json",
    };
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.isConfigured()) {
      return {
        broker: "ALPACA",
        accountId: "sim-alpaca-paper-01",
        status: "ACTIVE",
        currency: "USD",
        cash: 25000,
        portfolioValue: 25000,
        buyingPower: 100000,
        isLive: false,
        isConfigured: false,
      };
    }

    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/v2/account`, {
        headers: this.getHeaders(),
      }, 8000);

      if (!res.ok) {
        throw new Error(`Alpaca getAccount error: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as Record<string, any>;
      return {
        broker: "ALPACA",
        accountId: data.id || data.account_number || "alpaca-acct",
        status: data.status || "ACTIVE",
        currency: data.currency || "USD",
        cash: parseFloat(data.cash) || 0,
        portfolioValue: parseFloat(data.portfolio_value) || 0,
        buyingPower: parseFloat(data.buying_power) || 0,
        isLive: this.isLive,
        isConfigured: true,
      };
    } catch (err) {
      console.warn("Alpaca getAccount failed; returning simulated account state:", err);
      return {
        broker: "ALPACA",
        accountId: "sim-alpaca-paper-fallback",
        status: "DEGRADED",
        currency: "USD",
        cash: 25000,
        portfolioValue: 25000,
        buyingPower: 100000,
        isLive: false,
        isConfigured: false,
      };
    }
  }

  async getPositions(): Promise<BrokerPosition[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/v2/positions`, {
        headers: this.getHeaders(),
      }, 8000);

      if (!res.ok) {
        throw new Error(`Alpaca getPositions error: ${res.status}`);
      }

      const data = (await res.json()) as Record<string, any>;
      return Array.isArray(data)
        ? data.map((pos) => ({
            symbol: pos.symbol,
            qty: parseFloat(pos.qty) || 0,
            entryPrice: parseFloat(pos.avg_entry_price) || 0,
            currentPrice: parseFloat(pos.current_price) || 0,
            unrealizedPl: parseFloat(pos.unrealized_pl) || 0,
            unrealizedPlPercent: parseFloat(pos.unrealized_plpc) * 100 || 0,
            side: (pos.side || "long").toLowerCase() as "long" | "short",
          }))
        : [];
    } catch (err) {
      console.warn("Alpaca getPositions failed:", err);
      return [];
    }
  }

  async submitOrder(request: BrokerOrderRequest): Promise<BrokerOrderResponse> {
    const symbol = request.symbol.replace(/[\/\-].*$/, "").toUpperCase();
    const side = request.side.toLowerCase();
    // Bracket orders require whole shares. Round down so the position never
    // exceeds the risk-sized quantity, and refuse rather than force a 1-share minimum.
    const qty = Math.floor(request.qty);
    const nowIso = new Date().toISOString();

    if (!Number.isFinite(qty) || qty < 1) {
      throw new Error(
        `Alpaca order quantity must be at least 1 whole share (risk-sized quantity was ${request.qty}).`
      );
    }

    if (!this.isConfigured()) {
      // High-fidelity paper simulation fill
      const simOrderId = `alpaca-sim-${randomUUID().slice(0, 8)}`;
      return {
        broker: "ALPACA",
        orderId: simOrderId,
        clientOrderId: `cl-${simOrderId}`,
        symbol,
        side: request.side,
        qty,
        filledQty: qty,
        status: "FILLED",
        fillPrice: request.limitPrice || null,
        submittedAt: nowIso,
        filledAt: nowIso,
        executionMode: "PAPER",
        raw: { simulated: true, simulatedFill: true },
      };
    }

    try {
      const payload: Record<string, unknown> = {
        client_order_id: `st-${randomUUID()}`,
        symbol,
        qty: String(qty),
        side,
        type: request.type === "LIMIT" ? "limit" : "market",
        time_in_force: request.timeInForce || "day",
      };

      if (request.type === "LIMIT" && request.limitPrice) {
        payload.limit_price = String(request.limitPrice);
      }

      // Bracket order if both stop loss and take profit are specified
      if (request.stopLoss && request.takeProfit) {
        payload.order_class = "bracket";
        payload.stop_loss = {
          stop_price: String(request.stopLoss),
        };
        payload.take_profit = {
          limit_price: String(request.takeProfit),
        };
      }

      const res = await fetchWithTimeout(
        `${this.baseUrl}/v2/orders`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        },
        10000
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Alpaca order rejected (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as Record<string, any>;
      const status = (data.status || "submitted").toUpperCase();

      return {
        broker: "ALPACA",
        orderId: data.id,
        clientOrderId: data.client_order_id,
        symbol: data.symbol,
        side: request.side,
        qty: parseFloat(data.qty) || qty,
        filledQty: parseFloat(data.filled_qty) || 0,
        status: status === "FILLED" ? "FILLED" : "SUBMITTED",
        fillPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : null,
        submittedAt: data.submitted_at || nowIso,
        filledAt: data.filled_at || null,
        executionMode: this.isLive ? "LIVE" : "PAPER",
        raw: data,
      };
    } catch (err) {
      // Never report a simulated fill for a broker order that failed or timed
      // out: the order may not exist, or may exist in an unknown state.
      console.error("Alpaca submitOrder failed:", err);
      throw err;
    }
  }

  async closePosition(symbol: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return true;
    }

    const cleanSymbol = symbol.replace(/[\/\-].*$/, "").toUpperCase();
    const res = await fetchWithTimeout(
      `${this.baseUrl}/v2/positions/${encodeURIComponent(cleanSymbol)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      },
      10000
    );

    // 404 means there is no open position left to flatten (e.g. the bracket stop/target already filled).
    return res.ok || res.status === 404;
  }

  async getOrder(orderId: string): Promise<BrokerOrderResponse | null> {
    if (!this.isConfigured() || orderId.startsWith("alpaca-sim-") || orderId.startsWith("alpaca-fallback-")) {
      return {
        broker: "ALPACA",
        orderId,
        symbol: "EQUITY",
        side: "BUY",
        qty: 10,
        filledQty: 10,
        status: "FILLED",
        fillPrice: null,
        submittedAt: new Date().toISOString(),
        filledAt: new Date().toISOString(),
        executionMode: "PAPER",
      };
    }

    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/v2/orders/${orderId}`, {
        headers: this.getHeaders(),
      }, 8000);

      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, any>;
      return {
        broker: "ALPACA",
        orderId: data.id,
        clientOrderId: data.client_order_id,
        symbol: data.symbol,
        side: (data.side || "BUY").toUpperCase() as "BUY" | "SELL",
        qty: parseFloat(data.qty) || 0,
        filledQty: parseFloat(data.filled_qty) || 0,
        status: (data.status || "FILLED").toUpperCase() as any,
        fillPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : null,
        submittedAt: data.submitted_at || new Date().toISOString(),
        filledAt: data.filled_at || null,
        executionMode: this.isLive ? "LIVE" : "PAPER",
        raw: data,
      };
    } catch {
      return null;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.isConfigured() || orderId.startsWith("alpaca-sim-")) {
      return true;
    }

    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/v2/orders/${orderId}`,
        {
          method: "DELETE",
          headers: this.getHeaders(),
        },
        8000
      );
      return res.status === 204 || res.ok;
    } catch {
      return false;
    }
  }
}
