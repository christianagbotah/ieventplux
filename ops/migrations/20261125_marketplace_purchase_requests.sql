BEGIN;
CREATE TABLE "MarketplacePurchaseRequest" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "storeId" TEXT NOT NULL REFERENCES "MarketplaceStore"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "buyerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL,
 "currency" TEXT NOT NULL,
 "totalMinor" INTEGER NOT NULL CHECK ("totalMinor" BETWEEN 1 AND 100000000),
 "unitCount" INTEGER NOT NULL CHECK ("unitCount" BETWEEN 1 AND 50),
 "items" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'REQUESTED',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MarketplacePurchaseRequest_buyerId_storeId_requestKey_key" ON "MarketplacePurchaseRequest"("buyerId","storeId","requestKey");
CREATE INDEX "MarketplacePurchaseRequest_storeId_createdAt_idx" ON "MarketplacePurchaseRequest"("storeId","createdAt");
CREATE INDEX "MarketplacePurchaseRequest_buyerId_createdAt_idx" ON "MarketplacePurchaseRequest"("buyerId","createdAt");
COMMIT;
