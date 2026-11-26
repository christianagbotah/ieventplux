-- Run after 20261126_direct_attachments.sql.
ALTER TABLE "DirectAttachment" DROP CONSTRAINT IF EXISTS "DirectAttachment_mime_check";
ALTER TABLE "DirectAttachment" ADD CONSTRAINT "DirectAttachment_mime_check" CHECK ("mime" IN ('image/webp','application/pdf','audio/mp4','audio/webm'));
