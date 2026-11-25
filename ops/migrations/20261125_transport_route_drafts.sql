CREATE TABLE IF NOT EXISTS "TransportRouteDraft" (
 "id" TEXT PRIMARY KEY,
 "providerId" TEXT NOT NULL REFERENCES "ServiceProviderProfile"("id") ON DELETE RESTRICT,
 "label" TEXT NOT NULL CHECK (char_length("label") BETWEEN 2 AND 80),
 "labelKey" TEXT NOT NULL,
 "originAreaId" TEXT NOT NULL REFERENCES "ServiceArea"("id") ON DELETE RESTRICT,
 "destinationAreaId" TEXT NOT NULL REFERENCES "ServiceArea"("id") ON DELETE RESTRICT,
 "departureMinute" INTEGER NOT NULL CHECK ("departureMinute" BETWEEN 0 AND 1439),
 "operatingDays" INTEGER[] NOT NULL CHECK (cardinality("operatingDays") BETWEEN 1 AND 7 AND "operatingDays" <@ ARRAY[1,2,3,4,5,6,7]),
 "estimatedMinutes" INTEGER NOT NULL CHECK ("estimatedMinutes" BETWEEN 5 AND 1440),
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT','ARCHIVED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("originAreaId"<>"destinationAreaId"),
 UNIQUE ("providerId","labelKey")
);
CREATE INDEX IF NOT EXISTS "TransportRouteDraft_providerId_state_idx" ON "TransportRouteDraft"("providerId","state");
