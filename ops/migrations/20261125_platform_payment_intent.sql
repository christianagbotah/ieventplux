CREATE TABLE IF NOT EXISTS "PlatformPaymentIntent" (
 "id" TEXT PRIMARY KEY,
 "purpose" TEXT NOT NULL,
 "sourceId" TEXT NOT NULL,
 "reference" TEXT NOT NULL UNIQUE,
 "currency" TEXT NOT NULL CHECK ("currency" = 'GHS'),
 "totalMinor" INTEGER NOT NULL CHECK ("totalMinor" BETWEEN 0 AND 100000000),
 "platformGrossMinor" INTEGER NOT NULL CHECK ("platformGrossMinor" >= 0),
 "beneficiaryGrossMinor" INTEGER NOT NULL CHECK ("beneficiaryGrossMinor" >= 0),
 "beneficiaryKind" TEXT,
 "beneficiaryId" TEXT,
 "route" TEXT NOT NULL CHECK ("route" IN ('FREE','PLATFORM_DIRECT','PROVIDER_SPLIT')),
 "pricingVersion" TEXT NOT NULL,
 "snapshotHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PLANNED' CHECK ("status" = 'PLANNED'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("platformGrossMinor" + "beneficiaryGrossMinor" = "totalMinor"),
 CHECK (("beneficiaryKind" IS NULL) = ("beneficiaryId" IS NULL)),
 CHECK (("route" = 'FREE' AND "totalMinor" = 0) OR
 ("route" = 'PLATFORM_DIRECT' AND "totalMinor" > 0 AND "beneficiaryId" IS NULL AND "beneficiaryGrossMinor" = 0) OR
 ("route" = 'PROVIDER_SPLIT' AND "totalMinor" > 0 AND "beneficiaryId" IS NOT NULL AND "beneficiaryGrossMinor" > 0)),
 UNIQUE ("purpose","sourceId")
);
CREATE INDEX IF NOT EXISTS "PlatformPaymentIntent_beneficiaryKind_beneficiaryId_idx" ON "PlatformPaymentIntent"("beneficiaryKind","beneficiaryId");
CREATE INDEX IF NOT EXISTS "PlatformPaymentIntent_status_createdAt_idx" ON "PlatformPaymentIntent"("status","createdAt");
