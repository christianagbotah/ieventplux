BEGIN;
CREATE TABLE IF NOT EXISTS "MarketplaceStockHold" (
 "id" TEXT PRIMARY KEY,
 "requestId" TEXT NOT NULL REFERENCES "MarketplacePurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'HELD',
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "releasedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceStockHold_requestId_key" ON "MarketplaceStockHold"("requestId");
CREATE INDEX IF NOT EXISTS "MarketplaceStockHold_status_expiresAt_idx" ON "MarketplaceStockHold"("status","expiresAt");
CREATE TABLE IF NOT EXISTS "MarketplaceStockHoldLine" (
 "holdId" TEXT NOT NULL REFERENCES "MarketplaceStockHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "variantId" TEXT NOT NULL REFERENCES "MarketplaceVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantity" INTEGER NOT NULL,
 PRIMARY KEY("holdId","variantId")
);
CREATE INDEX IF NOT EXISTS "MarketplaceStockHoldLine_variantId_idx" ON "MarketplaceStockHoldLine"("variantId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='MarketplaceStockHold_state_check' AND conrelid='"MarketplaceStockHold"'::regclass) THEN
 ALTER TABLE "MarketplaceStockHold" ADD CONSTRAINT "MarketplaceStockHold_state_check" CHECK ((status='HELD' AND "releasedAt" IS NULL) OR (status IN ('RELEASED','EXPIRED') AND "releasedAt" IS NOT NULL)); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='MarketplaceStockHoldLine_quantity_check' AND conrelid='"MarketplaceStockHoldLine"'::regclass) THEN
 ALTER TABLE "MarketplaceStockHoldLine" ADD CONSTRAINT "MarketplaceStockHoldLine_quantity_check" CHECK(quantity BETWEEN 1 AND 20); END IF;
END $$;
COMMIT;
