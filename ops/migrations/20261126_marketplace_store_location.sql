-- Additive: existing stores remain discoverable without a location.
ALTER TABLE "MarketplaceStore" ADD COLUMN IF NOT EXISTS "gpsAddress" TEXT;
ALTER TABLE "MarketplaceStore" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "MarketplaceStore" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='MarketplaceStore_valid_coordinates' AND conrelid='"MarketplaceStore"'::regclass) THEN
  ALTER TABLE "MarketplaceStore" ADD CONSTRAINT "MarketplaceStore_valid_coordinates" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL) OR
    ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  );
 END IF;
END $$;
