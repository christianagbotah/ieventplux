-- Run after 20261126_push_installations.sql. Existing installations begin a new
-- eligibility window; historical notification backfill is intentionally avoided.
ALTER TABLE "PushInstallation" ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE IF NOT EXISTS "PushDelivery" (
 "id" TEXT PRIMARY KEY,
 "notificationId" TEXT NOT NULL REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "installationKeyHash" TEXT NOT NULL REFERENCES "PushInstallation"("keyHash") ON DELETE CASCADE ON UPDATE CASCADE,
 "sessionId" TEXT NOT NULL,
 "activationAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','SENDING','ACCEPTED','RECEIPT_OK','FAILED','UNKNOWN','SUPPRESSED')),
 "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 3),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "providerTicketId" TEXT,
 "failureCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushDelivery_notification_installation_key" ON "PushDelivery"("notificationId","installationKeyHash");
CREATE INDEX IF NOT EXISTS "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status","nextAttemptAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
