-- Apply after the private messaging migration. Original rows and identifiers remain.
ALTER TABLE "DirectMessage" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);
