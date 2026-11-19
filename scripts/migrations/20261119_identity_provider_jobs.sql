-- Additive, privacy-minimal state tracking for external KYC checks.
-- The table stores only job references, timestamps, and safe statuses (never image bytes).
CREATE TABLE IF NOT EXISTS "KycProviderJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'SMILE_ID',
  "externalJobId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'SUBMITTING',
  "consentAt" TIMESTAMP(3) NOT NULL,
  "noticeUrl" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "lastCheckedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KycProviderJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KycProviderJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "KycProviderJob_externalJobId_key" ON "KycProviderJob"("externalJobId");
CREATE INDEX IF NOT EXISTS "KycProviderJob_orgId_createdAt_idx" ON "KycProviderJob"("orgId", "createdAt");

-- Prevent multiple fee-generating jobs from racing for the same organizer.
CREATE UNIQUE INDEX IF NOT EXISTS "KycProviderJob_one_active_per_org" ON "KycProviderJob" ("orgId") WHERE "state" IN ('SUBMITTING', 'PROCESSING');
