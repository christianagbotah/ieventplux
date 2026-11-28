# iEventPlux Mobile (Expo / React Native)

> **Awards mobile parity (2026-11-23):** Event Detail includes native
> Awards & supporter voting. Participants can inspect nominees, see their
> own recorded vote, and cast one FREE vote per award category from the
> installed app. The same PostgreSQL voting ledger and privacy rules serve
> both web and native platforms. Organizer nomination management remains
> in the web portal for this increment. The updated mobile APK must still
> be rebuilt and tested on real devices before release.


> Native social parity (2026-11-23): the Event Detail screen now opens native
> Community conversations and Meet fellow attendees pages. These call the same
> server APIs used on web, with thread posting/replies, opt-in network profiles,
> follows, reports and blocks. No private attendee directory is stored offline.
> Source/JS bundle validation does NOT mean signed Android/iOS binaries have
> been installed or tested on real devices.

> Native meeting milestone (2026-11-23): A LiveKit/WebRTC group-call client
> now exists in source for custom Expo development builds, not Expo Go. It
> uses the existing meeting admission token endpoint and supports camera/mic,
> listen-only, paginated video tiles and periodic admission validation.
> Signed APK/IPA binaries and physical-device UAT are still outstanding.

Source for the iEventPlux attendee, check-in and meeting app. Talks to the same
v1 REST API as the web app (`/api/v1` on the iEventPlux Next.js deployment).

> **Honest status — updated 2026-11-14 (round 30)**
> **Verified statically:** full dependency install (lockfile committed), `tsc --noEmit` passes with **0 errors** against the real Expo SDK 52 / RN 0.76 dependency tree, and `expo export` produces production **Hermes bytecode bundles for both iOS (2.95 MB) and Android (2.96 MB)** — every import resolves, the Metro/Babel pipeline compiles, native-module codegen (expo-camera, expo-secure-store, react-native-svg, @react-native-community/netinfo) passes.
> **NOT verified here:** on-device runtime, EAS/native `.ipa`/`.apk` builds, store submission + billing, and real Hubtel checkout on a phone — this sandbox has no device/emulator and no store accounts (documented in the repo docs as external blockers).
> Dependency-drift lesson proven (round 25): a bare `bun install` resolved `react-native-svg` to 15.16.x, which breaks Expo SDK 52 codegen at bundle time — `npx expo install --fix` realigned it to 15.8.0 (recorded in the lockfile now, so a fresh install is reproducible).

## What the scaffold covers

| Area | Approach |
| --- | --- |
| Auth | `POST /auth/login` + cookie session (`ievx_session`) via RN's native cookie jar (`credentials: 'include'`); session restore via `GET /auth/me` (React context + useState — intentionally Zustand-free) |
| Discovery | `GET /discovery/home` → FlatList of upcoming events (poster/title/date/price) + **Live now** horizontal section (LIVE broadcasts → Broadcast screen), pull-to-refresh, loading/error/empty states |
| Event detail + purchase | `GET /events/{id|slug}` → ticket-type quantity pickers → `POST /orders` → `POST /payments/initiate` → `Linking.openURL(checkoutUrl)` (Hubtel hosted checkout; dev simulator returns a relative URL resolved against the API base) |
| My tickets + orders | `GET /tickets` → per-ticket `GET /tickets/{id}` → QR rendered natively from the server's `qrPayload` with `react-native-qrcode-svg`; **offline wallet** (list + opened QR credentials cached in AsyncStorage, labelled with saved-at, cleared on sign-out); **Orders tab** (`GET /orders`) |
| Check-in (staff) | `expo-camera` barcode scanning → `POST /checkin/scan` with `clientScanId` = device UUID (AsyncStorage) + per-scan suffix (server idempotency key); result banner ADMITTED/DUPLICATE/INVALID/CONFLICT; manual code fallback; **complete offline loop**: roster pre-download (`GET /checkin/roster`) + advisory offline verdicts, capped FIFO queue (500, dedup, drop-oldest surfaced), auto-sync on NetInfo reconnect + AppState active, `POST /checkin/sync` with CONFLICT/DUPLICATE/INVALID review panel |
| Broadcasts (viewer) | `GET /broadcasts/{id}/detail` → access verdict + replay surface; `POST /play` (entitlement + capacity gates: ENTITLEMENT_REQUIRED / ROOM_FULL surfaced verbatim) → 10-min playback token + heartbeat (`POST /heartbeat`, 60 s); SYNTHETIC delivery renders the labelled simulated-stream surface; chat via 5 s history polling + `POST /chat` send (LIVE only, server-enforced; ENDED = read-only transcript) |
| Deep links | scheme `ieventplux` (app.json); `ieventplux://order/{ref}` → MyTickets banner + refresh (payment confirmation always happens server-side) |

## Setup

```bash
cd mobile

# 1) install JS deps (nothing is committed — this is source only)
bun install        # or: npm install

# 2) align native package versions to Expo SDK 52's expected set
npx expo install --fix

# 3) point the app at your iEventPlux web deployment (REQUIRED)
#    Option A (recommended): env var, inlined at bundle time. Use your machine's LAN
#    IP (or the deployment URL) — `localhost` only works when the app runs on the
#    same host (e.g. an emulator + dev server on one machine):
EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:3000 npx expo start
#    Option B: edit app.json → expo.extra.apiBaseUrl to e.g. http://192.168.x.x:3000
#    (the shipped value is an intentional placeholder string — until replaced,
#     every API call fails fast with BASE_URL_NOT_CONFIGURED)

# 4) run
npx expo start                 # Expo Go — sufficient for scanning + full attendee flow
npx expo run:android           # dev build on a connected Android device/emulator
npx expo run:ios               # dev build on iOS (needs macOS + Xcode)
```

Notes:

- **Expo web target**: the `web` script exists, but `react-dom`,
  `react-native-web`, and `@expo/metro-runtime` are intentionally *not* in
  package.json (not part of this task's dependency set). Add them with
  `npx expo install react-dom react-native-web @expo/metro-runtime` if you
  want `expo start --web`.
- **Dependency corrections vs. the original brief** (verified against the npm
  registry at authoring time):
  - `react-native-qrcode-svg` is `^6.3.54` — the brief said `^8`, but **no
    v8 exists on npm** (latest is 6.3.54; peer `react-native-svg >= 14` is
    satisfied by ^15.8.0).
  - `expo-constants ~17.0.8` was added beyond the listed set: it is the
    supported way to read `app.json` → `expo.extra.apiBaseUrl` at runtime.
  - Versions otherwise follow Expo SDK 52's `bundledNativeModules`
    (expo ~52.0.0, react-native 0.76.5, expo-camera ~16.0.18,
    expo-secure-store ~14.0.1, react-native-screens ~4.4.0,
    react-native-safe-area-context ^4.12.0, async-storage ^1.23.1).

## Sessions vs. the web app (documented adaptation)

The web app authenticates with an **httpOnly cookie** (`ievx_session`).
There is no Bearer-token endpoint today, so the mobile client:

1. sends every request with `credentials: 'include'` — React Native's
   fetch persists cookies in the native cookie jar, so sign-in survives app
   restarts; and
2. keeps a **SecureStore slot for a future Bearer token** (`Authorization`
   header is attached automatically when one is stored — it stays empty until
   a mobile session-token endpoint exists server-side).

See `src/api/client.ts` (top-of-file comment) and
`docs/NATIVE_MODULES.md`.

## Camera / scanning — what needs a development build

- **Barcode scanning works in Expo Go** (`expo-camera`'s `CameraView` +
  `barcodeScannerSettings`). The check-in screen is usable in Expo Go.
- **RTMP live broadcasting does NOT work in Expo Go** and is **not implemented
  in this scaffold at all** — `expo-camera` dropped RTMP publishing; a custom
  native module + development build is required (see `docs/NATIVE_MODULES.md`).
- Store billing (if ever enabled) also requires a development build.

## Purchase capability matrix (Apple / Google rules)

| Purchase | In native app | Rule |
| --- | --- | --- |
| Physical event tickets (thing you buy outside the app experience) | **Hubtel hosted checkout in the external browser — allowed** (Apple 3.1.1(e) / Google's physical-goods exception) | This is what the "Buy" button does |
| Digital-only access (e.g. virtual-event passes consumed in-app) | **Requires store billing** (Apple IAP / Google Play Billing) once developer accounts are configured | **Not implemented — disabled** |
| Subscriptions sold in the native app | **Requires store billing** | **Not implemented — disabled** |

No in-app-purchase code exists in this scaffold; nothing attempts to sell
digital-only goods inside the app. When store accounts exist, add
`react-native-iap` (development build) and gate the flows above.

## Remaining device and release gates

- Not device-tested here; first `expo start` on real hardware may surface runtime-only issues.
- Broadcast viewing renders the labelled SYNTHETIC stream (the platform has no
  Cloudflare Stream credentials yet). When delivery flips to
  `CLOUDFLARE_STREAM`, the same screen shows the delivery note and the token /
  session / heartbeat chain is already correct for a native HLS player
  (`expo-video` is the planned drop-in).
- Broadcast chat polls every 5 s (the web uses socket.io realtime). Polling is
  the deliberately simple mobile transport — same server-filtered history.
- No push notifications (`expo-notifications` + a server push-token channel),
  no reels/organizer studio tooling, no profile editing — the web portal
  remains the full organizer client.
- Deep-link return (`ieventplux://order/{ref}`) is wired, but the web
  deployment's Hubtel return URL currently points at the **web** return route;
  a mobile-aware redirect (web → scheme) is a small server-side TODO.
- Automated tests ARE present now (R32): `bun test` in `mobile/` runs 40 pure-logic unit
  tests (offline check-in queue + wallet caches — see `src/lib/*.test.ts`). Still no
  on-device/automation suite (Detox/Maestro) — device hardware remains an external blocker.

## Layout

```
mobile/
  App.tsx               navigation container + stack + deep links
  index.ts              explicit entry point (registerRootComponent)
  app.json              Expo config (scheme, ids, plugins, extra.apiBaseUrl)
  src/api/client.ts     typed API client + shared formatting helpers
  src/store/session.tsx session context (user + memberships)
  src/navigation.ts     shared route param types
  src/types/globals.d.ts process.env.EXPO_PUBLIC_* ambient declaration
  src/theme.ts          colors (primary #059669, accent #f59e0b, bg #fafaf9)
  src/screens/          Login / Discover / EventDetail / MyTickets / Checkin
  docs/NATIVE_MODULES.md   dev-build matrix, store-billing blockers, commands
```

(`src/store/session.tsx` is TSX rather than TS because the provider renders JSX —
the brief's `session.ts` filename, adjusted for extension.)


## Android internal QA APK downloads and automatic update notices

The official Android QA release downloads are at:
https://github.com/christianagbotah/ieventplux/releases

Initial marketplace/awards APK: android-qa-614f3b2, app-release.apk.
The GitHub pre-release provides a persistent asset, unlike temporary
7-day GitHub Actions artifacts.

**Installation and update security:** the app checks for a signed, published
GitHub QA release on launch and return to foreground, then asks users whether
to download. Android still requires the user to open/approve APK installation;
this is not silent auto-installation or Google Play automatic updates. Test APKs
from before the fixed QA signing identity may require a **one-time uninstall**
(because a new signing certificate cannot replace the old one). From the first
persistent-key build onward, future builds with the same protected QA key
can be installed over the existing app, preserving user data. The signing
keystore and passwords live only in protected GitHub Actions secrets, not git.

After a successful main branch CI run involving native mobile source,
the Android QA Auto Build After CI workflow dispatches the standalone
Android APK build. Once it passes signature and JS-bundle checks, a
main-only publish job adds a tagged prerelease. A GitHub source-code
push without a published APK is NOT an app update.

The new native update checker queries the official release index on
launch and foreground resumes, compares the embedded source revision
and build time against published releases, and offers Download update
or Not now. When offline it does not interrupt the user. Only
official GitHub release APK links are accepted.

Important limitations: these are debug-signed internal QA APKs, not
Google Play releases. Android requires explicit user installation.
Early builds used ephemeral signing keys: Android can require a
one-time uninstall/reinstall when the signing identity changes.
Configure a consistent non-production QA signing key through approved
GitHub secret management for smooth upgrades. Never use QA keys for
production Play signing. Older APKs built BEFORE this checker cannot
show update notifications: install the next QA APK once to enable it.
iOS distribution is separate and requires TestFlight or Apple store.


### Cross-platform UI parity

The web public portal is the current canonical interface. Read [`../docs/NATIVE_WEB_PARITY_20261124.md`](../docs/NATIVE_WEB_PARITY_20261124.md) for the audit, UX mappings, unfinished native work and device certification gates. `src/lib/web-parity.test.ts` checks the native six-tab navigation, hero copy and brand tokens against the actual web source so they cannot diverge silently.

Native Discover filtering uses `src/lib/discovery-filters.ts` and `src/components/DiscoverFilterSheet.tsx`. It sends the same `/events` filters as the web portal and never silently substitutes a partial cached list after a server failure. Update detection uses the public Android QA release index; the user still authorizes APK installation.

Native event detail parity is implemented through `src/components/EventProgrammeSections.tsx` and `src/lib/event-programme.ts`. The component reads only the published/gated fields returned by `/api/v1/events/{id}`; it never assumes that an absent private programme or unavailable souvenir checkout is usable. The organizer/merchandise editors still require further native implementation and device QA.

### Native Organizer Studio

From the authenticated Account screen, tap **Organizer studio** to view accepted memberships and the server-authorized event catalogue. Roles with event creation permissions can create unpublished event drafts or edit basic metadata. Validation and the final organization/plan permission gates remain on the server. The event start/end fields explicitly use device-local 24-hour time (`YYYY-MM-DD`, `HH:MM`) and submit absolute ISO instants alongside the detected timezone; changing an existing event's schedule or visibility still requires the advanced web organizer studio. Native payments, ticket-tier management, publishing, document uploads and payouts are not asserted by this increment.

### Android QA update resilience

`src/components/AndroidUpdateNotice.tsx` now checks the official GitHub public QA-release list alongside the deployed website's release index, because web artifact deployment can lag a newly published native build. The pure parser in `src/lib/android-updates.ts` rejects draft releases, non-QA tags, unapproved asset names, unexpected download origins and implausibly small APKs. Rechecks are throttled to at most one every two minutes while the app is open, with no background installation or automatic download. The first APK containing this improvement must itself be installed from a verified GitHub release; already-installed older APK code cannot receive this behavior retroactively.

### Native creator journey

The Discover creator calls to action now use the native Organizer Studio and Create Organizer screens, not web links. Registration uses the existing `/orgs` API and mirrors all six organizer types with role-specific public profile fields. New organizations are pending verification, not approved for paid sales. Document upload, payout configuration and advanced editor tooling remain under the secure web workflows until corresponding native capability is certified.

### Premium native visual system

`src/ui/PremiumUI.tsx` is the shared visual design foundation. It provides branded SVG hero backgrounds and reusable section headings, elevated cards, buttons, pill badges and event/commerce glyphs. The first migration covers Discover, the navigation dock, Account, Marketplace, Wallet, Login and organizer screens. See `../docs/NATIVE_PREMIUM_VISUAL_SYSTEM_20261124.md`. This is true React Native layout, not a web portal redirect. Source and CI validation must be followed by real Android/iOS visual/device QA before claiming production polish.

### Premium social views

Following, Reels event previews, Live Hub and event detail/ticket-selection screens now reuse the premium React Native design system. See `../docs/NATIVE_PREMIUM_VISUAL_SYSTEM_20261124.md`. Following clears account-specific activity on sign-out. Reels remain truthful event/artwork previews and do not offer fake playable video. Real-time broadcasts appear only when the backend reports LIVE. Full visual certification requires physical-device screenshots and accessibility testing.

### Premium community, networking and awards

Community, consent-based private event networking, and award voting now use the shared native premium UI. Moderation and one-free-vote ballots continue through the original server permissions and use a custom native ActionDialog. Private profile and discussion requests are guarded against stale asynchronous responses; sensitive networking rosters are purged when consent is revoked. The UI does not fake public vote counts, identities or payment acceptance.

### Native meeting controls and permissions

The meeting prep screen and LiveKit native room use the premium visual language. In-app camera/microphone toggles request the phone OS permission when enabling a device after listen-only joining. Native LiveKit is the primary eligible route; secure browser joining is explicitly a fallback. Participant tiles are paginated (8 at a time), not subject to an artificial meeting attendee count. Phone screen sharing is not implemented. Real-device two-party call and previously denied permission tests remain mandatory.

### Premium utility screens

Check-in, marketplace storefront details, and broadcast viewer reuse the React Native premium visual system. The check-in workflow retains its idempotent server-side verdicts and offline queue/roster. Storefront variants use real server SKU/stock and do not expose unimplemented checkout. Broadcast viewers retain clearly labelled synthetic presentation until a verified playable stream is configured. Run device UAT before claiming production-ready media or scanning.

### Real native reel playback (media-ready only)

`expo-video` renders verified published MP4 clip URLs from this platform through `VerifiedReelMedia`. One visible clip may autoplay muted when Reels is focused and the app is active. Viewers control sound and pausing; off-screen clips are not loaded. Image-only event previews remain static. This does **not** create or approve public video assets: native video upload/moderation/transcoding and byte-range serving are separately required and subject to content-rights safeguards. Real-device playback needs verification on the newly built APK.

### Native Create & seller workspace
The native navigation intentionally replaces the Reels tab with Create. Reels stays accessible on Discover and in Create; all other primary destinations remain unchanged. Creation hub, seller store draft, product draft, stock movement and publication use the existing server APIs directly. The signed-in return destination is preserved on the create journey. Advanced product media/specifications, variants, store branding and settlement editing still need native parity; physical-device UAT is mandatory.
