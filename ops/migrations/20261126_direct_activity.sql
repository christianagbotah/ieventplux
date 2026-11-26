-- Apply after direct messaging. Activity is ephemeral, scoped to sessions.
CREATE TABLE IF NOT EXISTS "DirectActivity" (
 "conversationId" TEXT NOT NULL REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "activeUntil" TIMESTAMP(3) NOT NULL,
 "typingUntil" TIMESTAMP(3),
 PRIMARY KEY ("conversationId","sessionId"),
 CONSTRAINT "DirectActivity_typing_bound" CHECK ("typingUntil" IS NULL OR "typingUntil" <= "activeUntil")
);
CREATE INDEX IF NOT EXISTS "DirectActivity_activeUntil_idx" ON "DirectActivity"("activeUntil");
