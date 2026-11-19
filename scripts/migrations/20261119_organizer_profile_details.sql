-- Non-destructive addition for type-specific organizer profiles.
-- Existing organizations are preserved; the default is an empty JSON document.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "profileDetails" TEXT NOT NULL DEFAULT '{}';
