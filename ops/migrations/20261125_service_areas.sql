CREATE TABLE IF NOT EXISTS "ServiceArea" (
 "id" TEXT PRIMARY KEY,
 "country" TEXT NOT NULL CHECK ("country"='GH'),
 "region" TEXT NOT NULL CHECK (char_length("region") BETWEEN 2 AND 80),
 "name" TEXT NOT NULL CHECK (char_length("name") BETWEEN 2 AND 100),
 "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN 4 AND 12),
 "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -4 AND 2),
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdBy" TEXT NOT NULL,
 UNIQUE ("country","region","name")
);
CREATE INDEX IF NOT EXISTS "ServiceArea_country_active_region_name_idx" ON "ServiceArea"("country","active","region","name");
CREATE TABLE IF NOT EXISTS "ProviderServiceAreaConsent" (
 "providerId" TEXT PRIMARY KEY REFERENCES "ServiceProviderProfile"("id") ON DELETE RESTRICT,
 "areaId" TEXT NOT NULL REFERENCES "ServiceArea"("id") ON DELETE RESTRICT,
 "consentedAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3),
 CHECK ("revokedAt" IS NULL OR "revokedAt">="consentedAt")
);
CREATE INDEX IF NOT EXISTS "ProviderServiceAreaConsent_areaId_revokedAt_idx" ON "ProviderServiceAreaConsent"("areaId","revokedAt");
