# iEventPlux — Event programme, lineup and souvenir studio UX

**Purpose:** Extend the platform's unified, professional event-creation interface to the existing event operations editor and attendee-facing event details. This is an accessibility/accuracy/visual refinement, not new payment functionality.

**Existing testing URL:** https://ieventplux.lightworldtech.com/ only.

## Organizer programme studio
- Distinct, responsive evergreen Studio header with live counts for people, programme PDFs and catalogue items.
- Collapsible, touch-friendly sections with consistent icons, live labels, focus states and discoverable actions.
- All artist/speaker/guest form fields have persistent accessible labels: name, role, topic/performance, biography, optional scheduled start/finish, photo, public visibility, display order. A profile marked hidden stays off the public event page according to existing server policy. Existing role set includes headliner, artist, main/assistant/guest speaker, special guest, panelist, MC, DJ and host.
- Safe client validation before saving: legal roles, ≥2-character names, 0–1,000 sort order, valid device-local timestamps and finish after start. Existing server `contributorPayload` remains authoritative. Local device times are converted to ISO before sending.
- Media upload buttons have loading/disabled states and input reset so replacing a photo/PDF is straightforward. PDF must be type `application/pdf` and ≤10MB; PNG/JPEG/WebP images ≤5MB; the server checks signatures and permissions.
- Programme document list uses accessible live text links. Removal requires a named confirmation.
- Souvenir products have persistently labelled name/SKU/variant/price/stock/description/photo/display order/visibility. Exact decimal-to-pesewa conversion prevents accidental rounding of fractional pennies. Server continues enforcing prices, sold/reserved stock protections, SKU uniqueness and authorization. Product visibility is reversible from the edit form.
- Removing lineup participants, programme PDFs and hiding products requires an explicit accessible confirmation dialog with cancel. No request happens on initial Remove/Hide click.
- Inline errors keep entered data intact when an API request fails; try-again state is visible when loading fails.

## Attendee event detail
- Lineup uses the same refined cards, with informational badges and a clear description.
- Appearance date is shown using `event.timezone`, not silently the visitor device's local time zone.
- Published programme PDFs are described clearly and remain governed by the existing access policy.
- No speculative artist identities or guest details are generated.

## Protection and boundaries
- No new server routes, migrations, checkout code, order APIs, upload limits or permissions.
- **Merchandise paid online ordering, QR pickup and stock reservations remain disabled and clearly identified as unavailable** until payment and fulfilment workflows have been separately verified. Catalogue display is not advertised as transactional.
- The SFU meeting system retains its no-fixed-app-participant-cap setting.
- No new paid services or separate staging host.
- Deploy only the exact verified web revision with rollback to current live release, leaving realtime/worker/SFU/media guard and customer records unaffected.

## QA requirements
- `bun test src/portal/lib/event-programme-form.test.ts src/server/event-programme-policy.test.ts`
- Source typecheck, targeted ESLint, GitHub web/mobile/production CI, optimized isolated build
- Live public event page browser checks at mobile/tablet/desktop without modifying real events
- Authenticated organizer UAT for lineup add/edit/hide, portrait upload, programme PDF upload and authorised file download remains necessary. Without test organizer credentials, do not claim these authenticated action flows were exercised.
