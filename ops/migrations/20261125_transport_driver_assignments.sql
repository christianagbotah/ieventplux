CREATE TABLE IF NOT EXISTS "TransportDriverAssignment" (
 "id" TEXT PRIMARY KEY,
 "vehicleId" TEXT NOT NULL REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT,
 "driverId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT,
 "inviteHash" TEXT NOT NULL UNIQUE CHECK ("inviteHash" ~ '^[a-f0-9]{64}$'),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'INVITED' CHECK ("state" IN ('INVITED','ACCEPTED','ENDED')),
 "acceptedAt" TIMESTAMP(3),
 "endedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("state"='INVITED' AND "driverId" IS NULL AND "acceptedAt" IS NULL AND "endedAt" IS NULL) OR
 ("state"='ACCEPTED' AND "driverId" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "endedAt" IS NULL) OR
 ("state"='ENDED' AND "endedAt" IS NOT NULL AND (("driverId" IS NULL AND "acceptedAt" IS NULL) OR ("driverId" IS NOT NULL AND "acceptedAt" IS NOT NULL))))
);
CREATE INDEX IF NOT EXISTS "TransportDriverAssignment_vehicleId_state_idx" ON "TransportDriverAssignment"("vehicleId","state");
CREATE INDEX IF NOT EXISTS "TransportDriverAssignment_driverId_state_idx" ON "TransportDriverAssignment"("driverId","state");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportDriverAssignment_one_current_vehicle" ON "TransportDriverAssignment"("vehicleId") WHERE "state" IN ('INVITED','ACCEPTED');
CREATE UNIQUE INDEX IF NOT EXISTS "TransportDriverAssignment_one_current_driver" ON "TransportDriverAssignment"("driverId") WHERE "state"='ACCEPTED';
