CREATE TABLE IF NOT EXISTS "MarketplaceSettlementOnboarding" (
 "storeId" TEXT PRIMARY KEY REFERENCES "MarketplaceStore"("id") ON DELETE CASCADE,
 "state" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("state" IN ('REQUESTED','SANDBOX_VERIFIED','REJECTED')),
 "testSubaccountCode" TEXT UNIQUE,
 "maskedAccount" TEXT,
 "bankName" TEXT,
 "requestedBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
