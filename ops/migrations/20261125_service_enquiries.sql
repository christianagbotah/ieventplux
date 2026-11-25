CREATE TABLE IF NOT EXISTS "ServiceEnquiry" (
 "id" TEXT PRIMARY KEY,
 "providerId" TEXT NOT NULL REFERENCES "ServiceProviderProfile"("id") ON DELETE RESTRICT,
 "customerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL CHECK (char_length("requestKey") BETWEEN 16 AND 100),
 "description" TEXT NOT NULL CHECK (char_length("description") BETWEEN 10 AND 1000),
 "community" TEXT NOT NULL CHECK (char_length("community") BETWEEN 2 AND 100),
 "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','QUOTED','DECLINED','WITHDRAWN','QUOTE_ACCEPTED','QUOTE_DECLINED')),
 "quoteMinor" INTEGER CHECK ("quoteMinor" BETWEEN 1 AND 100000000),
 "quoteNote" TEXT CHECK (char_length("quoteNote") BETWEEN 2 AND 500),
 "quoteExpiresAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK (("quoteMinor" IS NULL AND "quoteNote" IS NULL AND "quoteExpiresAt" IS NULL AND "status" IN ('REQUESTED','DECLINED','WITHDRAWN')) OR
 ("quoteMinor" IS NOT NULL AND "quoteNote" IS NOT NULL AND "quoteExpiresAt" IS NOT NULL AND "status" IN ('QUOTED','QUOTE_ACCEPTED','QUOTE_DECLINED','WITHDRAWN'))),
 UNIQUE ("providerId","customerId","requestKey")
);
CREATE INDEX IF NOT EXISTS "ServiceEnquiry_providerId_createdAt_idx" ON "ServiceEnquiry"("providerId","createdAt");
CREATE INDEX IF NOT EXISTS "ServiceEnquiry_customerId_createdAt_idx" ON "ServiceEnquiry"("customerId","createdAt");
