CREATE TABLE IF NOT EXISTS "TransportCharterPlan" (
 "id" TEXT PRIMARY KEY,
 "customerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "requestKey" TEXT NOT NULL CHECK (char_length("requestKey") BETWEEN 16 AND 100),
 "title" TEXT NOT NULL CHECK (char_length("title") BETWEEN 2 AND 100),
 "originAreaId" TEXT NOT NULL REFERENCES "ServiceArea"("id") ON DELETE RESTRICT,
 "destinationAreaId" TEXT NOT NULL REFERENCES "ServiceArea"("id") ON DELETE RESTRICT,
 "departureAt" TIMESTAMP(3) NOT NULL,
 "returnAt" TIMESTAMP(3),
 "passengers" INTEGER NOT NULL CHECK ("passengers" BETWEEN 1 AND 1000),
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT','CANCELLED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("returnAt" IS NULL OR ("returnAt">"departureAt" AND "returnAt"<="departureAt"+INTERVAL '30 days')),
 UNIQUE ("customerId","requestKey")
);
CREATE INDEX IF NOT EXISTS "TransportCharterPlan_customerId_createdAt_idx" ON "TransportCharterPlan"("customerId","createdAt");
