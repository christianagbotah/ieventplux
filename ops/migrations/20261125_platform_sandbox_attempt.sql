CREATE TABLE IF NOT EXISTS "PlatformSandboxAttempt" (
 "id" TEXT PRIMARY KEY,
 "intentId" TEXT UNIQUE NOT NULL REFERENCES "PlatformPaymentIntent"("id") ON DELETE RESTRICT,
 "reference" TEXT UNIQUE NOT NULL,
 "expectedAmountMinor" INTEGER NOT NULL CHECK ("expectedAmountMinor" BETWEEN 1 AND 100000000),
 "currency" TEXT NOT NULL CHECK ("currency" = 'GHS'),
 "recipientCode" TEXT,
 "status" TEXT NOT NULL DEFAULT 'PREPARED' CHECK ("status" IN ('PREPARED','NOTIFICATION_RECEIVED')),
 "providerTransactionId" TEXT UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK (("status"='PREPARED' AND "providerTransactionId" IS NULL) OR ("status"='NOTIFICATION_RECEIVED' AND "providerTransactionId" IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS "PlatformSandboxNotification" (
 "dedupKey" TEXT PRIMARY KEY,
 "attemptId" TEXT NOT NULL REFERENCES "PlatformSandboxAttempt"("id") ON DELETE RESTRICT,
 "providerTransactionId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlatformSandboxNotification_attemptId_idx" ON "PlatformSandboxNotification"("attemptId");
