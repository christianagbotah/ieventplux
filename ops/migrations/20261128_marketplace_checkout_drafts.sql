BEGIN;
CREATE TABLE IF NOT EXISTS "MarketplaceCheckoutDraft" (
 "id" TEXT PRIMARY KEY,
 "holdId" TEXT NOT NULL REFERENCES "MarketplaceStockHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'PREPARED',
 "currency" TEXT NOT NULL,
 "totalMinor" INTEGER NOT NULL,
 "unitCount" INTEGER NOT NULL,
 "items" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "closedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceCheckoutDraft_holdId_key" ON "MarketplaceCheckoutDraft"("holdId");
CREATE INDEX IF NOT EXISTS "MarketplaceCheckoutDraft_status_createdAt_idx" ON "MarketplaceCheckoutDraft"("status","createdAt");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='MarketplaceCheckoutDraft_state_check' AND conrelid='"MarketplaceCheckoutDraft"'::regclass) THEN
 ALTER TABLE "MarketplaceCheckoutDraft" ADD CONSTRAINT "MarketplaceCheckoutDraft_state_check" CHECK ((status='PREPARED' AND "closedAt" IS NULL) OR (status IN ('RELEASED','EXPIRED') AND "closedAt" IS NOT NULL)); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='MarketplaceCheckoutDraft_amount_check' AND conrelid='"MarketplaceCheckoutDraft"'::regclass) THEN
 ALTER TABLE "MarketplaceCheckoutDraft" ADD CONSTRAINT "MarketplaceCheckoutDraft_amount_check" CHECK (currency='GHS' AND "totalMinor" BETWEEN 1 AND 100000000 AND "unitCount" BETWEEN 1 AND 50 AND jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 15); END IF;
END $$;
COMMIT;
