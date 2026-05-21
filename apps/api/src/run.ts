import { callGeminiAgent } from "./services/geminiAgent";

async function main() {
  const fakeInvestigation = {
    symbol: "NVDA",
    signals: [
      {
        signalType: "VOLUME_ANOMALY",
        percentChange: 180,
      },
    ],
    newsContext: [
      { headline: "NVDA volume spikes after earnings rumors" },
    ],
    sentimentScore: 0.82,
  };

  const result = await callGeminiAgent(
    fakeInvestigation as any,
    "test-session"
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);