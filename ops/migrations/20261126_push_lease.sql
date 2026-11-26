-- Run after push installation and delivery migrations. Existing rows
-- intentionally remain unleased until their authorized device refreshes.
ALTER TABLE "PushInstallation" ADD COLUMN IF NOT EXISTS "leaseUntil" TIMESTAMP(3);
