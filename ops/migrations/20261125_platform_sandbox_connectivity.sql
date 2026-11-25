CREATE TABLE IF NOT EXISTS "PlatformSandboxCheckout" (
 "attemptId" TEXT PRIMARY KEY REFERENCES "PlatformSandboxAttempt"("id") ON DELETE RESTRICT,
 "requestHash" TEXT NOT NULL,
 "status" TEXT NOT NULL CHECK ("status" IN ('INITIALIZING','REDIRECTED','UNKNOWN')),
 "checkoutUrl" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK (("status"='REDIRECTED') = ("checkoutUrl" IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS "PlatformSandboxCollectionEvidence" (
 "attemptId" TEXT PRIMARY KEY REFERENCES "PlatformSandboxAttempt"("id") ON DELETE RESTRICT,
 "providerTransactionId" TEXT UNIQUE NOT NULL,
 "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" BETWEEN 1 AND 100000000),
 "currency" TEXT NOT NULL CHECK ("currency"='GHS'),
 "recipientCode" TEXT,
 "allocation" TEXT NOT NULL CHECK ("allocation" IN ('REVIEW_REQUIRED','PLATFORM_DIRECT')),
 "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("recipientCode" IS NULL) = ("allocation"='PLATFORM_DIRECT'))
);
