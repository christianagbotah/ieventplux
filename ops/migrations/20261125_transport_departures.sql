CREATE TABLE IF NOT EXISTS "TransportDepartureDraft" (
 "id" TEXT PRIMARY KEY,
 "routeId" TEXT NOT NULL REFERENCES "TransportRouteDraft"("id") ON DELETE RESTRICT,
 "vehicleId" TEXT NOT NULL REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT,
 "departureAt" TIMESTAMP(3) NOT NULL,
 "arrivalAt" TIMESTAMP(3) NOT NULL,
 "allocatedSeats" INTEGER NOT NULL CHECK ("allocatedSeats" BETWEEN 1 AND 100),
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT','CANCELLED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("arrivalAt">"departureAt" AND "arrivalAt"<="departureAt"+INTERVAL '24 hours'),
 UNIQUE ("routeId","vehicleId","departureAt")
);
CREATE INDEX IF NOT EXISTS "TransportDepartureDraft_vehicleId_state_departureAt_arrivalAt_idx" ON "TransportDepartureDraft"("vehicleId","state","departureAt","arrivalAt");
