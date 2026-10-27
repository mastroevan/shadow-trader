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

export class CoinbaseBrokerConnector implements BrokerConnector {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private isLive: boolean;

  constructor() {
    this.apiKey = process.env.COINBASE_API_KEY || "";
    this.apiSecret = process.env.COINBASE_API_SECRET || "";
    this.isLive = (process.env.COINBASE_EXECUTION_MODE || "paper").toLowerCase() === "live";
    this.baseUrl =
      process.env.COINBASE_BASE_URL || "https://api.coinbase.com/api/v3/brokerage";
  }

  getBrokerType(): BrokerType {
    return "COINBASE";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  private normalizeProductId(symbol: string): string {
    const clean = symbol.trim().toUpperCase();
    if (clean.includes("/")) {
      return clean.replace("/", "-");
    }
    if (clean.includes("-")) {
      return clean;
    }
    return `${clean}-USD`;
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "CB-ACCESS-KEY": this.apiKey,
      "CB-ACCESS-PASSPHRASE": this.apiSecret,
    };
  }

  async getAccount(): Promise<BrokerAccount> {
    if (!this.isConfigured()) {
      return {
        broker: "COINBASE",
        accountId: "sim-coinbase-crypto-01",
        status: "ACTIVE",
        currency: "USD",
        cash: 15000,
        portfolioValue: 15000,
        buyingPower: 15000,
        isLive: false,
        isConfigured: false,
      };
    }

    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/accounts`, {
        headers: this.getHeaders(),
      }, 8000);

      if (!res.ok) {
        throw new Error(`Coinbase accounts error: ${res.status}`);
      }

      const data = (await res.json()) as Record<string, any>;
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      const usdAcct = accounts.find((a: any) => a.currency === "USD" || a.currency === "USDC");
      const cash = usdAcct ? parseFloat(usdAcct.available_balance?.value || "0") : 15000;

      return {
        broker: "COINBASE",
        accountId: usdAcct?.uuid || "coinbase-primary",
        status: "ACTIVE",
        currency: "USD",
        cash,
        portfolioValue: cash,
        buyingPower: cash,
        isLive: this.isLive,
        isConfigured: true,
      };
    } catch (err) {
      console.warn("Coinbase getAccount failed; returning simulated account state:", err);
      return {
        broker: "COINBASE",
        accountId: "sim-coinbase-paper-fallback",
        status: "DEGRADED",
        currency: "USD",
        cash: 15000,
        portfolioValue: 15000,
        buyingPower: 15000,
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
      const res = await fetchWithTimeout(`${this.baseUrl}/accounts`, {
        headers: this.getHeaders(),
      }, 8000);

      if (!res.ok) return [];
      const data = (await res.json()) as Record<string, any>;
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];

      return accounts
        .filter((a: any) => !["USD", "USDC", "USDT"].includes(a.currency) && parseFloat(a.available_balance?.value || "0") > 0)
        .map((a: any) => ({
          symbol: `${a.currency}-USD`,
          qty: parseFloat(a.available_balance?.value || "0"),
          entryPrice: 0,
          currentPrice: 0,
          unrealizedPl: 0,
          unrealizedPlPercent: 0,
          side: "long" as const,
        }));
    } catch {
      return [];
    }
  }

  async submitOrder(request: BrokerOrderRequest): Promise<BrokerOrderResponse> {
    const productId = this.normalizeProductId(request.symbol);
    const side = request.side.toUpperCase() as "BUY" | "SELL";
    const qty = request.qty;
    const nowIso = new Date().toISOString();

    // Coinbase Advanced Trade has no paper-trading environment, so anything
    // other than explicit live mode must stay simulated — otherwise "paper"
    // mode with configured keys would place real orders.
    if (this.isSimulated()) {
      // High-fidelity crypto paper simulation fill
      const simOrderId = `coinbase-sim-${randomUUID().slice(0, 8)}`;
      return {
        broker: "COINBASE",
        orderId: simOrderId,
        clientOrderId: `cl-${simOrderId}`,
        symbol: productId,
        side,
        qty,
        filledQty: qty,
        status: "FILLED",
        fillPrice: request.limitPrice || null,
        submittedAt: nowIso,
        filledAt: nowIso,
        executionMode: "PAPER",
        raw: { simulated: true, simulatedCryptoFill: true },
      };
    }

    try {
      const clientOrderId = `cb-${randomUUID()}`;
      const payload: Record<string, unknown> = {
        client_order_id: clientOrderId,
        product_id: productId,
        side,
        order_configuration: {
          market_market_ioc: {
            base_size: String(qty),
          },
        },
      };

      const res = await fetchWithTimeout(
        `${this.baseUrl}/orders`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        },
        10000
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Coinbase order error (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as Record<string, any>;
      const orderId = data.order_id || data.success_response?.order_id || clientOrderId;

      return {
        broker: "COINBASE",
        orderId,
        clientOrderId,
        symbol: productId,
        side,
        qty,
        filledQty: qty,
        status: "FILLED",
        fillPrice: request.limitPrice || null,
        submittedAt: nowIso,
        filledAt: nowIso,
        executionMode: this.isLive ? "LIVE" : "PAPER",
        raw: data,
      };
    } catch (err) {
      // Never report a simulated fill for a live order: the caller must know
      // the order did not go through (or may be in an unknown state).
      console.error("Coinbase submitOrder failed:", err);
      throw err;
    }
  }

  async closePosition(symbol: string, side: "BUY" | "SELL", qty: number): Promise<boolean> {
    if (this.isSimulated()) {
      return true;
    }

    // Spot crypto has no position object to flatten; close with an offsetting market order.
    const order = await this.submitOrder({
      symbol,
      side: side === "BUY" ? "SELL" : "BUY",
      qty,
      type: "MARKET",
      executionMode: "LIVE",
    });
    return order.status !== "REJECTED" && order.status !== "CANCELED";
  }

  private isSimulated(): boolean {
    return !this.isConfigured() || !this.isLive;
  }

  async getOrder(orderId: string): Promise<BrokerOrderResponse | null> {
    if (this.isSimulated() || orderId.startsWith("coinbase-sim-") || orderId.startsWith("coinbase-fallback-")) {
      return {
        broker: "COINBASE",
        orderId,
        symbol: "BTC-USD",
        side: "BUY",
        qty: 0.1,
        filledQty: 0.1,
        status: "FILLED",
        fillPrice: null,
        submittedAt: new Date().toISOString(),
        filledAt: new Date().toISOString(),
        executionMode: "PAPER",
      };
    }

    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/orders/historical/${orderId}`, {
        headers: this.getHeaders(),
      }, 8000);

      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, any>;
      const order = data.order || data;
      return {
        broker: "COINBASE",
        orderId: order.order_id || orderId,
        symbol: order.product_id || "CRYPTO",
        side: (order.side || "BUY").toUpperCase() as "BUY" | "SELL",
        qty: parseFloat(order.order_configuration?.market_market_ioc?.base_size || "0"),
        filledQty: parseFloat(order.filled_size || "0"),
        status: (order.status || "FILLED").toUpperCase() as any,
        fillPrice: order.average_filled_price ? parseFloat(order.average_filled_price) : null,
        submittedAt: order.created_time || new Date().toISOString(),
        filledAt: order.last_fill_time || null,
        executionMode: this.isLive ? "LIVE" : "PAPER",
        raw: order,
      };
    } catch {
      return null;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    if (this.isSimulated() || orderId.startsWith("coinbase-sim-")) {
      return true;
    }

    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/orders/batch_cancel`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({ order_ids: [orderId] }),
        },
        8000
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
