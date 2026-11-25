CREATE TABLE IF NOT EXISTS "MarketplacePaymentPreference" (
 "storeId" TEXT PRIMARY KEY REFERENCES "MarketplaceStore"("id") ON DELETE CASCADE,
 "mobileMoney" BOOLEAN NOT NULL DEFAULT false,
 "card" BOOLEAN NOT NULL DEFAULT false,
 "cash" BOOLEAN NOT NULL DEFAULT false,
 "destination" TEXT NOT NULL DEFAULT 'BANK' CHECK ("destination" IN ('BANK','MOMO')),
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "MarketplaceCommissionRule" (
 "key" TEXT PRIMARY KEY,
 "basisPoints" INTEGER NOT NULL CHECK ("basisPoints" BETWEEN 0 AND 9999),
 "updatedBy" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
