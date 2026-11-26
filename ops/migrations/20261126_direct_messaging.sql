-- Additive; no existing chat or meeting data is changed.
CREATE TABLE IF NOT EXISTS "DirectConversation" (
 "id" TEXT PRIMARY KEY,
 "participantLowId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "participantHighId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "requesterId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACCEPTED','DECLINED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DirectConversation_distinct_participants" CHECK ("participantLowId" <> "participantHighId"),
 CONSTRAINT "DirectConversation_requester_is_participant" CHECK ("requesterId" IN ("participantLowId","participantHighId"))
);
CREATE UNIQUE INDEX IF NOT EXISTS "DirectConversation_pair_key" ON "DirectConversation"("participantLowId","participantHighId");
CREATE INDEX IF NOT EXISTS "DirectConversation_participantLowId_updatedAt_idx" ON "DirectConversation"("participantLowId","updatedAt");
CREATE INDEX IF NOT EXISTS "DirectConversation_participantHighId_updatedAt_idx" ON "DirectConversation"("participantHighId","updatedAt");
CREATE TABLE IF NOT EXISTS "DirectMessage" (
 "id" TEXT PRIMARY KEY,
 "conversationId" TEXT NOT NULL REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "senderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "clientKey" TEXT NOT NULL CHECK (length("clientKey") BETWEEN 16 AND 128),
 "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 4000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "readAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "DirectMessage_client_key" ON "DirectMessage"("conversationId","senderId","clientKey");
CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_createdAt_id_idx" ON "DirectMessage"("conversationId","createdAt","id");
CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_readAt_idx" ON "DirectMessage"("conversationId","readAt");
