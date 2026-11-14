# iEventPlux Mobile (Expo / React Native)

Source scaffold for the iEventPlux attendee + check-in app. Talks to the same
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

## What remains (honest)

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
- No tests (no Jest config, no Detox).

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
