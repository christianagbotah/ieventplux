CREATE TABLE IF NOT EXISTS "TransportVehicle" (
 "id" TEXT PRIMARY KEY,
 "providerId" TEXT NOT NULL REFERENCES "ServiceProviderProfile"("id") ON DELETE RESTRICT,
 "label" TEXT NOT NULL CHECK (char_length("label") BETWEEN 2 AND 80),
 "labelKey" TEXT NOT NULL,
 "vehicleClass" TEXT NOT NULL CHECK ("vehicleClass" IN ('TAXI_CAR','MINIBUS','COACH','MOTORCYCLE','TRICYCLE','RENTAL_CAR','TOW_TRUCK')),
 "passengerSeats" INTEGER NOT NULL CHECK ("passengerSeats" BETWEEN 0 AND 100),
 "stationAreaId" TEXT REFERENCES "ServiceArea"("id") ON DELETE RESTRICT,
 "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT','ARCHIVED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("providerId","labelKey"),
 CHECK (("vehicleClass"='TAXI_CAR' AND "passengerSeats" BETWEEN 1 AND 6) OR
 ("vehicleClass"='MINIBUS' AND "passengerSeats" BETWEEN 1 AND 30) OR
 ("vehicleClass"='COACH' AND "passengerSeats" BETWEEN 1 AND 100) OR
 ("vehicleClass"='MOTORCYCLE' AND "passengerSeats"=1) OR
 ("vehicleClass"='TRICYCLE' AND "passengerSeats" BETWEEN 1 AND 4) OR
 ("vehicleClass"='RENTAL_CAR' AND "passengerSeats" BETWEEN 1 AND 15) OR
 ("vehicleClass"='TOW_TRUCK' AND "passengerSeats"=0))
);
CREATE INDEX IF NOT EXISTS "TransportVehicle_providerId_state_idx" ON "TransportVehicle"("providerId","state");
