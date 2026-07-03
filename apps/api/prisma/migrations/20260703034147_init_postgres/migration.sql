-- CreateTable
CREATE TABLE "TradeLifecycleEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ledgerId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeLifecycleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisRecord" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeLifecycleEntry_ledgerId_key" ON "TradeLifecycleEntry"("ledgerId");

-- CreateIndex
CREATE INDEX "TradeLifecycleEntry_kind_status_idx" ON "TradeLifecycleEntry"("kind", "status");

-- CreateIndex
CREATE INDEX "TradeLifecycleEntry_kind_symbol_idx" ON "TradeLifecycleEntry"("kind", "symbol");

-- CreateIndex
CREATE INDEX "TradeLifecycleEntry_updatedAt_idx" ON "TradeLifecycleEntry"("updatedAt");

-- CreateIndex
CREATE INDEX "ThesisRecord_symbol_idx" ON "ThesisRecord"("symbol");

-- CreateIndex
CREATE INDEX "ThesisRecord_status_idx" ON "ThesisRecord"("status");

-- CreateIndex
CREATE INDEX "ThesisRecord_generatedAt_idx" ON "ThesisRecord"("generatedAt");
