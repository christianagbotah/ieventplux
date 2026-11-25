CREATE TABLE IF NOT EXISTS "ProviderCredentialDocument" (
 "id" TEXT PRIMARY KEY,
 "providerId" TEXT NOT NULL REFERENCES "ServiceProviderProfile"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('IDENTITY_FRONT','IDENTITY_BACK','OPERATOR_AUTHORIZATION','VEHICLE_AUTHORIZATION','INSURANCE','TRADE_AUTHORIZATION','UTILITY_AUTHORIZATION')),
 "mime" TEXT NOT NULL CHECK ("mime"='image/webp'),
 "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 8388608),
 "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("reviewStatus" IN ('PENDING','SCREENED','REJECTED')),
 "reviewerId" TEXT,
 "reviewedAt" TIMESTAMP(3),
 CHECK (("reviewStatus"='PENDING' AND "reviewerId" IS NULL AND "reviewedAt" IS NULL) OR
 ("reviewStatus"<>'PENDING' AND "reviewerId" IS NOT NULL AND "reviewedAt" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "ProviderCredentialDocument_providerId_uploadedAt_idx" ON "ProviderCredentialDocument"("providerId","uploadedAt");
CREATE INDEX IF NOT EXISTS "ProviderCredentialDocument_reviewStatus_uploadedAt_idx" ON "ProviderCredentialDocument"("reviewStatus","uploadedAt");
