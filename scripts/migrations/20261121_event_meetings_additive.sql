-- iEventPlux: additive, non-destructive event meeting tables.
-- APPLY ONLY after a verified backup/restore rehearsal and schema review.
-- Do not deploy standalone real-time service before the matching app build.
BEGIN;

CREATE TABLE IF NOT EXISTS "EventMeeting" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "maxParticipants" INTEGER NOT NULL DEFAULT 6,
  "chatEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "screenShareEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventMeeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventMeeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventMeeting_eventId_key" ON "EventMeeting"("eventId");
CREATE INDEX IF NOT EXISTS "EventMeeting_status_createdAt_idx" ON "EventMeeting"("status", "createdAt");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventMeeting_maxParticipants_check'
    AND conrelid = '"EventMeeting"'::regclass) THEN
    ALTER TABLE "EventMeeting" ADD CONSTRAINT "EventMeeting_maxParticipants_check" CHECK ("maxParticipants" BETWEEN 2 AND 6);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "MeetingMessage" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'VISIBLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MeetingMessage_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "EventMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MeetingMessage_meetingId_createdAt_idx" ON "MeetingMessage"("meetingId", "createdAt");


CREATE TABLE IF NOT EXISTS "MeetingBan" (
  "meetingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "removedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingBan_pkey" PRIMARY KEY ("meetingId", "userId"),
  CONSTRAINT "MeetingBan_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "EventMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetingBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MeetingBan_userId_idx" ON "MeetingBan"("userId");

COMMIT;
