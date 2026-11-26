-- Invitation-only state; apply after direct conversation migration.
CREATE TABLE IF NOT EXISTS "DirectCall" (
 "id" TEXT PRIMARY KEY,
 "conversationId" TEXT NOT NULL REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "callerId" TEXT NOT NULL,
 "calleeId" TEXT NOT NULL,
 "callerSessionId" TEXT NOT NULL,
 "acceptedSessionId" TEXT,
 "clientKey" TEXT NOT NULL CHECK (length("clientKey") BETWEEN 16 AND 128),
 "kind" TEXT NOT NULL CHECK ("kind" IN ('VOICE','VIDEO')),
 "status" TEXT NOT NULL DEFAULT 'RINGING' CHECK ("status" IN ('RINGING','ACCEPTED','DECLINED','CANCELLED','MISSED','ENDED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "acceptedAt" TIMESTAMP(3),
 "endedAt" TIMESTAMP(3),
 CHECK ("callerId" <> "calleeId"),
 CHECK ("expiresAt" > "createdAt"),
 CHECK (("acceptedSessionId" IS NULL) = ("acceptedAt" IS NULL)),
 CHECK ("status" <> 'ACCEPTED' OR "acceptedAt" IS NOT NULL),
 CHECK (("status" IN ('RINGING','ACCEPTED')) = ("endedAt" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "DirectCall_client_key" ON "DirectCall"("conversationId","callerId","clientKey");
CREATE INDEX IF NOT EXISTS "DirectCall_status_expiresAt_idx" ON "DirectCall"("status","expiresAt");
CREATE INDEX IF NOT EXISTS "DirectCall_conversationId_createdAt_id_idx" ON "DirectCall"("conversationId","createdAt","id");
CREATE TABLE IF NOT EXISTS "DirectCallSlot" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "callId" TEXT NOT NULL REFERENCES "DirectCall"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DirectCallSlot_callId_idx" ON "DirectCallSlot"("callId");
