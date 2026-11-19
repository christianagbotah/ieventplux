# iEventPlux mobile organizer layout and permanent poster storage

**Date:** 19 November 2026. **Scope:** Account profile, organizer dashboard, organizer event management, production media uploads.

## Mobile design fixes

- Account identity now uses a small avatar column plus a readable name, with email/organizer identity on a full-width row and the workspace button below on mobile. Prevents words such as "Christian" splitting into a 1–2-character trailing fragment in a narrow flex column.
- Organizer KPI tiles use two mobile columns, compact spacing and the icon next to the heading, with amounts and descriptions below.
- Verification notice uses icon + heading in its top row, an unclipped full-width explanation, and the document-submission CTA beneath on narrow screens.
- Organizer events use two columns only: small cover image at left, an untruncated title/status at right; date, location and real ticket metrics span the full card width, followed by a two-column button row. On larger displays the actions can wrap in a single row.
- Removed the duplicate "New event" button from the event page (the organizer toolbar already provides it) and replaced broken-cover glyphs with an accessible missing-image fallback.
- No media, verification or finance data is invented by the redesigned cards.

## Root cause and fix for broken uploaded posters

The uploaded cover for **Ai Workshop** was found at `.next/standalone/public/uploads/<UUID>.jpg` with valid JPEG bytes but a public GET to `/uploads/<UUID>.jpg` returned HTTP 404. The standalone Next.js server changes its current directory to its compiled standalone folder, and production routes do not consistently recognize public asset files added after the build. Replacing `.next` at deployment also removes those uploads. This is a reliability/data-retention defect, not a missing image from the user.

Permanent fix:

1. `IEVENTPLUX_UPLOADS_DIR` is an **absolute, durable, writable** filesystem directory. It must be configured in the private production environment. The request handler refuses to write into the release tree when this setting is absent in production.
2. `POST /api/v1/uploads` continues enforcing organizer permissions and a maximum of 5MB; it now also validates PNG/JPEG/WebP file signatures. It creates a UUID-named image in durable storage and rolls the file back if database insertion fails.
3. `GET /uploads/[filename]` reads only tightly validated UUID image basenames from the durable directory. It returns correct `Content-Type`, `nosniff`, same-origin resource policy and cache policy without exposing filesystem paths. Private ID/KYC evidence is **not** served by this route.
4. Existing images from `public/uploads` and saved Next standalone releases were copied to the durable location, preserving URLs in existing event and media records. Leave the old release for rollback as long as needed, but future deployments must not keep media inside `.next`.

## QA/acceptance

- TypeScript and targeted ESLint have no errors; unit tests validate filename/path traversal rejection and file type signatures.
- Build the exact code to ship in an isolated staging tree, configure the same absolute media path in staging, and request the existing sample JPEG with HTTP 200 + valid JPEG MIME/body and a fake UUID with 404.
- Anonymous uploader and restricted routes reject unauthorized access; verify production `/api/v1/health` remains healthy with database up.
- Manually inspect account, verification and event cards at phone viewport widths (320px, 360px, 390px), including an event with/without a poster, long names and long venue titles. A browser visual acceptance pass remains outstanding until such a session is run.
- Keep uploads directory and backup outside `.next` releases; production releases must never remove it.
