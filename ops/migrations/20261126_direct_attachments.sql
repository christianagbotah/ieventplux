-- Apply after direct messaging and moderation.
CREATE TABLE IF NOT EXISTS "DirectAttachment" (
 "messageId" TEXT PRIMARY KEY REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "filename" TEXT NOT NULL CHECK (length("filename") BETWEEN 1 AND 100),
 "mime" TEXT NOT NULL CHECK ("mime" IN ('image/webp','application/pdf')),
 "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 2097152),
 "digest" TEXT NOT NULL CHECK ("digest" ~ '^[a-f0-9]{64}$'),
 "payload" BYTEA NOT NULL CHECK (octet_length("payload") = "size" + 28)
);
