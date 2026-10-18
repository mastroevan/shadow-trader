export type BrokerType = "ALPACA" | "COINBASE" | "SIMULATED";

export type BrokerExecutionMode = "PAPER" | "LIVE";

export type BrokerOrderStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "CANCELED"
  | "REJECTED";

export type BrokerOrderSide = "BUY" | "SELL";

export type BrokerOrderType = "MARKET" | "LIMIT" | "BRACKET";

export type BrokerAccount = {
  broker: BrokerType;
  accountId: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  isLive: boolean;
  isConfigured: boolean;
};

export type BrokerPosition = {
  symbol: string;
  qty: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  unrealizedPlPercent: number;
  side: "long" | "short";
};

export type BrokerOrderRequest = {
  symbol: string;
  side: BrokerOrderSide;
  qty: number;
  type?: "MARKET" | "LIMIT";
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  timeInForce?: "gtc" | "day" | "ioc";
  executionMode?: BrokerExecutionMode;
};

export type BrokerOrderResponse = {
  broker: BrokerType;
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: BrokerOrderSide;
  qty: number;
  filledQty: number;
  status: BrokerOrderStatus;
  fillPrice: number | null;
  submittedAt: string;
  filledAt: string | null;
  executionMode: BrokerExecutionMode;
  raw?: unknown;
};

export interface BrokerConnector {
  getBrokerType(): BrokerType;
  isConfigured(): boolean;
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  submitOrder(request: BrokerOrderRequest): Promise<BrokerOrderResponse>;
  getOrder(orderId: string): Promise<BrokerOrderResponse | null>;
  cancelOrder(orderId: string): Promise<boolean>;
}
