CREATE TABLE IF NOT EXISTS "ServiceAppointment" (
 "id" TEXT PRIMARY KEY,
 "enquiryId" TEXT NOT NULL UNIQUE REFERENCES "ServiceEnquiry"("id") ON DELETE RESTRICT,
 "startsAt" TIMESTAMP(3) NOT NULL,
 "endsAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','CONFIRMED','DECLINED','CANCELLED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("endsAt" >= "startsAt" + INTERVAL '15 minutes' AND "endsAt" <= "startsAt" + INTERVAL '8 hours')
);
CREATE INDEX IF NOT EXISTS "ServiceAppointment_status_startsAt_endsAt_idx" ON "ServiceAppointment"("status","startsAt","endsAt");
