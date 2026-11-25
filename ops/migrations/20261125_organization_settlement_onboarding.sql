CREATE TABLE IF NOT EXISTS "SandboxSettlementClaim" (
 "code" TEXT PRIMARY KEY,
 "beneficiaryKind" TEXT NOT NULL CHECK ("beneficiaryKind" IN ('ORGANIZATION','STORE')),
 "beneficiaryId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("beneficiaryKind","beneficiaryId")
);
INSERT INTO "SandboxSettlementClaim" ("code","beneficiaryKind","beneficiaryId")
 SELECT "testSubaccountCode",'STORE',"storeId" FROM "MarketplaceSettlementOnboarding"
 WHERE "testSubaccountCode" IS NOT NULL
 ON CONFLICT ("code") DO NOTHING;
CREATE TABLE IF NOT EXISTS "OrganizationSettlementOnboarding" (
 "orgId" TEXT PRIMARY KEY REFERENCES "Organization"("id") ON DELETE CASCADE,
 "state" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("state" IN ('REQUESTED','SANDBOX_VERIFIED')),
 "testSubaccountCode" TEXT UNIQUE,
 "maskedAccount" TEXT,
 "bankName" TEXT,
 "requestedBy" TEXT NOT NULL,
 "reviewedBy" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
