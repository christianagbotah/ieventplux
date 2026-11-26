-- Additive device registry only. No transport is activated by this migration.
CREATE TABLE IF NOT EXISTS "PushInstallation" (
  "keyHash" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "providerToken" TEXT NOT NULL UNIQUE,
  "platform" TEXT NOT NULL CHECK ("platform" IN ('ANDROID','IOS')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PushInstallation_keyHash_format" CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "PushInstallation_token_length" CHECK (length("providerToken") BETWEEN 20 AND 240)
);
CREATE INDEX IF NOT EXISTS "PushInstallation_sessionId_revokedAt_idx"
  ON "PushInstallation" ("sessionId","revokedAt");
