# Mobile Join Meeting and modern confirmation dialogs

Reproduced in a synthetic signed-in mobile Chromium preview by clicking the
actual Join Meeting button. The LiveKit UI crashed before any media prompt,
with browser error: Tried to access LayoutContext context outside a
LayoutContextProvider provider.

Fixes:
- Wrap media renderer and controls inside LayoutContextProvider.
- On direct Join click, ask for the selected camera/microphone permissions
  synchronously before waiting for the authenticated SFU token. Immediately
  release temporary test tracks, and let LiveKit acquire media on connection.
- Device selection permits listening-only access. Provide clear explanations
  for blocked access, unavailable cameras and busy devices. Android in-app
  browsers may prohibit device prompts; advise opening in Chrome/Samsung Internet.
- Replace native browser confirmations with shared, accessible Radix alert
  dialogs for end-meeting, participant removal and KYC document deletion.

QA: focused permissions/meeting tests, typecheck, lint, optimized build,
headless mobile browser with synthetic meeting, deployment smoke, real-device UAT.
Server membership, ticket, RSVP and paid admission rules are unchanged.
No DB migration, no fixed SFU participant limit, and no new provider costs.
