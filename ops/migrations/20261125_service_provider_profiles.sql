CREATE TABLE IF NOT EXISTS "ServiceProviderProfile" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "category" TEXT NOT NULL,
  "country" TEXT NOT NULL CHECK ("country" = 'GH'),
  "community" TEXT NOT NULL CHECK (char_length("community") BETWEEN 2 AND 100),
  "displayName" TEXT NOT NULL CHECK (char_length("displayName") BETWEEN 2 AND 100),
  "serviceDescription" TEXT NOT NULL CHECK (char_length("serviceDescription") BETWEEN 10 AND 1000),
  "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("reviewStatus" IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
  "published" BOOLEAN NOT NULL DEFAULT false,
  "jurisdictionApproved" BOOLEAN NOT NULL DEFAULT false,
  "credentialValidUntil" TIMESTAMP(3),
  "availabilityState" TEXT NOT NULL DEFAULT 'OFFLINE' CHECK ("availabilityState" IN ('OFFLINE','AVAILABLE','BUSY','PAUSED')),
  "availableUntil" TIMESTAMP(3),
  "lastConfirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK (NOT "published" OR ("reviewStatus"='APPROVED' AND "jurisdictionApproved")),
  UNIQUE ("ownerId","category","country")
);
CREATE INDEX IF NOT EXISTS "ServiceProviderProfile_country_category_published_reviewStatus_idx" ON "ServiceProviderProfile"("country","category","published","reviewStatus");
CREATE INDEX IF NOT EXISTS "ServiceProviderProfile_ownerId_createdAt_idx" ON "ServiceProviderProfile"("ownerId","createdAt");
