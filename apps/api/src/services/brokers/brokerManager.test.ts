import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getBrokerStatus,
  selectBrokerForSymbol,
  executeBrokerTrade,
} from "./brokerManager";
import { AlpacaBrokerConnector } from "./alpaca";
import { CoinbaseBrokerConnector } from "./coinbase";
import { upsertWatchlistEntry } from "../watchlist";

describe("Broker Connectors & Manager", () => {
  it("selects Alpaca for equities and Coinbase for crypto symbols", () => {
    const stockBroker = selectBrokerForSymbol("NVDA");
    assert.equal(stockBroker.getBrokerType(), "ALPACA");

    const spyBroker = selectBrokerForSymbol("SPY");
    assert.equal(spyBroker.getBrokerType(), "ALPACA");

    const btcBroker = selectBrokerForSymbol("BTC/USD");
    assert.equal(btcBroker.getBrokerType(), "COINBASE");

    const ethBroker = selectBrokerForSymbol("ETH-USD");
    assert.equal(ethBroker.getBrokerType(), "COINBASE");

    const solBroker = selectBrokerForSymbol("SOL");
    assert.equal(solBroker.getBrokerType(), "COINBASE");
  });

  it("returns broker status and account summaries for both brokers", async () => {
    const status = await getBrokerStatus();
    assert.equal(status.alpaca.broker, "ALPACA");
    assert.equal(status.coinbase.broker, "COINBASE");
    assert.equal(status.defaultEquitiesBroker, "ALPACA");
    assert.equal(status.defaultCryptoBroker, "COINBASE");
    assert.ok(status.alpaca.buyingPower > 0);
    assert.ok(status.coinbase.cash > 0);
  });

  it("alpaca connector submits simulated orders with bracket stops and targets", async () => {
    const alpaca = new AlpacaBrokerConnector();
    const order = await alpaca.submitOrder({
      symbol: "AAPL",
      side: "BUY",
      qty: 10,
      type: "MARKET",
      limitPrice: 220,
      stopLoss: 215,
      takeProfit: 235,
      executionMode: "PAPER",
    });

    assert.equal(order.broker, "ALPACA");
    assert.equal(order.symbol, "AAPL");
    assert.equal(order.side, "BUY");
    assert.equal(order.qty, 10);
    assert.equal(order.status, "FILLED");
    assert.ok(order.orderId.length > 0);
  });

  it("coinbase connector submits simulated crypto orders with normalized symbol", async () => {
    const coinbase = new CoinbaseBrokerConnector();
    const order = await coinbase.submitOrder({
      symbol: "BTC/USD",
      side: "BUY",
      qty: 0.25,
      type: "MARKET",
      limitPrice: 65000,
      executionMode: "PAPER",
    });

    assert.equal(order.broker, "COINBASE");
    assert.equal(order.symbol, "BTC-USD");
    assert.equal(order.side, "BUY");
    assert.equal(order.qty, 0.25);
    assert.equal(order.status, "FILLED");
  });

  it("executeBrokerTrade rejects setup if risk gate fails", async () => {
    const entry = {
      id: "mock-lowconf",
      symbol: "LOWCONF",
      direction: "BULLISH",
      suggestedAction: "WATCH",
      confidenceScore: 0.4, // below gate threshold
      startPrice: 100,
      stopLoss: 98,
      takeProfit: 106,
      riskRewardRatio: 1.0,
      thesis: "Test low confidence setup",
      entryTrigger: "Breakout",
      invalidation: "Stop",
      watchConditions: [],
      timeHorizon: "1W",
      status: "Watching" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executeBrokerTrade(entry);
    assert.ok(result);
    assert.equal("rejected" in result && result.rejected, true);
    if ("rejected" in result) {
      assert.ok(result.reasons.length > 0);
    }
  });

  it("executeBrokerTrade executes order via broker and transitions trade to Triggered", async () => {
    const entry = {
      id: "mock-nvda-1",
      symbol: "NVDA",
      direction: "BULLISH",
      suggestedAction: "ALERT",
      confidenceScore: 0.88,
      startPrice: 130,
      stopLoss: 125,
      takeProfit: 145,
      riskRewardRatio: 3.0,
      volumeConfirmation: true,
      trendStrength: 0.8,
      marketCondition: "Bullish momentum",
      triggerType: "BREAKOUT",
      thesis: "High probability breakout setup",
      entryTrigger: "Move above 130",
      invalidation: "Drop below 125",
      watchConditions: ["Volume surge"],
      timeHorizon: "1W",
      status: "Watching" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executeBrokerTrade(entry, {
      broker: "ALPACA",
      executionMode: "PAPER",
      quantity: 15,
      notes: "Phase 4 broker test execution",
    });

    assert.ok(result);
    assert.ok(!("rejected" in result));
    if (!("rejected" in result)) {
      assert.equal(result.entry.status, "Triggered");
      assert.equal(result.entry.gateStatus, "APPROVED");
      assert.equal(result.order.broker, "ALPACA");
      assert.equal(result.order.qty, 15);
      assert.ok(result.order.orderId.length > 0);
    }
  });

  it("coinbase stays simulated in paper mode even when API keys are configured", async () => {
    const saved = { ...process.env };
    process.env.COINBASE_API_KEY = "configured-key";
    process.env.COINBASE_API_SECRET = "configured-secret";
    process.env.COINBASE_EXECUTION_MODE = "paper";
    // Point at an unroutable host so any real network call would fail loudly.
    process.env.COINBASE_BASE_URL = "http://127.0.0.1:9";
    try {
      const coinbase = new CoinbaseBrokerConnector();
      const order = await coinbase.submitOrder({
        symbol: "ETH/USD",
        side: "BUY",
        qty: 0.5,
        type: "MARKET",
        limitPrice: 3000,
      });

      assert.equal(order.executionMode, "PAPER");
      assert.ok(order.orderId.startsWith("coinbase-sim-"));
    } finally {
      process.env = saved;
    }
  });

  it("alpaca rounds fractional quantities down instead of up", async () => {
    const alpaca = new AlpacaBrokerConnector();
    const order = await alpaca.submitOrder({
      symbol: "AAPL",
      side: "BUY",
      qty: 10.7,
      type: "MARKET",
      limitPrice: 220,
    });

    assert.equal(order.qty, 10);
  });

  it("alpaca refuses orders sized below one whole share", async () => {
    const alpaca = new AlpacaBrokerConnector();
    await assert.rejects(
      alpaca.submitOrder({
        symbol: "AAPL",
        side: "BUY",
        qty: 0.4,
        type: "MARKET",
        limitPrice: 220,
      }),
      /at least 1 whole share/
    );
  });

  it("alpaca reports a failed live order instead of faking a fill", async () => {
    const saved = { ...process.env };
    process.env.ALPACA_API_KEY_ID = "configured-key";
    process.env.ALPACA_API_SECRET_KEY = "configured-secret";
    process.env.ALPACA_BASE_URL = "http://127.0.0.1:9";
    try {
      const alpaca = new AlpacaBrokerConnector();
      await assert.rejects(
        alpaca.submitOrder({
          symbol: "AAPL",
          side: "BUY",
          qty: 5,
          type: "MARKET",
          limitPrice: 220,
        })
      );
    } finally {
      process.env = saved;
    }
  });
});
