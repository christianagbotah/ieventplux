# Native modules, development builds & platform blockers

What runs where in this scaffold — and what cannot run without a **development
build** (a custom `expo run:android` / `expo run:ios` binary, not Expo Go).

## Capability matrix

| Capability | Library | Expo Go? | Dev build? | Status in this scaffold |
| --- | --- | --- | --- | --- |
| Event discovery, login, orders, hosted checkout, tickets, notifications | fetch (JS) | ✅ works | ✅ works | Implemented (`src/api/client.ts`) |
| Ticket QR display | `react-native-qrcode-svg` (+ `react-native-svg`) | ✅ works | ✅ works | Implemented (`MyTicketsScreen`) |
| Session token slot | `expo-secure-store` | ✅ works | ✅ works | Implemented (empty until server exposes a token — see below) |
| Offline scan queue | `@react-native-async-storage/async-storage` | ✅ works | ✅ works | **Complete** (`CheckinScreen` + `src/lib/checkin-offline.ts`: roster pre-download, advisory offline verdicts, capped FIFO queue with dedup, NetInfo/AppState auto-sync, CONFLICT review panel) |
| Network reachability | `@react-native-community/netinfo` | ✅ works | ✅ works | Implemented (check-in auto-sync trigger) |
| **Broadcast viewing (viewer side)** | fetch + Animated (SYNTHETIC surface) | ✅ works | ✅ works | Implemented (`BroadcastScreen`: entitlement/capacity gates, playback token + 60 s heartbeat, polling chat). Real HLS needs `expo-video` once Cloudflare Stream credentials exist — RTMP **publishing** (organizer side) is the part that needs a custom native module. |
| **Camera barcode scanning (check-in)** | `expo-camera` `CameraView` + `barcodeScannerSettings` | ✅ **barcode scanning DOES work in Expo Go** | ✅ works | Implemented (`CheckinScreen`) |
| **RTMP live broadcasting / live publishing** | — | ❌ **does NOT work in Expo Go** | ❌ needs a **custom native module**, not just a dev build | **NOT IMPLEMENTED.** `expo-camera` dropped RTMP publishing; streaming requires a bespoke native module (e.g. an RTMP/WHIP client written in Kotlin/Swift) wired through an Expo config plugin. Budget this as a separate workstream before promising live-from-the-door features. |
| In-app purchase (store billing) | `react-native-iap` or expo-community wrappers | ❌ | ✅ required | **Disabled / not present.** See store-billing section. |
| Push notifications | `expo-notifications` | partial (limited in Go) | ✅ required for prod | Not implemented. |

**Why the two camera claims look contradictory but aren't:** expo-camera's
*barcode scanning* is a supported, Expo Go–compatible feature. Its *live
streaming* (RTMP publishing) is not — that capability was removed from
expo-camera and never existed in Expo Go. Scanning ✅ in Expo Go; broadcasting
❌ everywhere in this scaffold.

## Store billing blockers (Apple / Google)

- **Physical event tickets** — goods consumed outside the app — may be sold via
  **Hubtel hosted checkout opened in the system browser**
  (`Linking.openURL`). This is the only purchase path implemented, and it
  matches Apple guideline 3.1.1(e) (out-of-app purchases for physical goods)
  and Google Play's physical-goods exception.
- **Digital-only access and subscriptions sold inside the native app** are
  gated off. Per Apple 3.1.1 / Google Play Billing rules they must use
  **In-App Purchase / Play Billing**, which requires:
  1. Apple Developer + Google Play developer accounts, paid agreements and
     fee/merchant setup — none configured yet;
  2. a native billing SDK (`react-native-iap` or similar) — a **development
     build**, never Expo Go;
  3. product catalog + server-side receipt validation endpoints.
- Until all three exist, no in-app purchase UI exists in this scaffold and the
  digital-goods flows are documented as **disabled** — the app does not
  attempt to sell digital-only goods, it routes paid physical-ticket orders to
  the hosted checkout only.

## Deep link registration

- Scheme `ieventplux` is declared once in `app.json` (`expo.scheme`). Expo
  configures the Android intent filter and iOS URL type automatically on both
  Expo Go (prefixed `ieventplux://` while in development under Go) and in
  dev/production builds.
- Handled paths (App.tsx → `NavigationContainer` linking config):
  - `ieventplux://` → Discover
  - `ieventplux://order/{reference}` → MyTickets with an `orderRef` banner
    (hosted-checkout return; payment state is confirmed server-side via
    provider callbacks — never by the return URL).
- **Honest caveat:** the server's Hubtel `returnUrl` currently points at the
  *web* return route (`/api/v1/payments/return/{reference}`). The mobile
  deep-link return is wired client-side, but the deployment must be taught to
  redirect (302 → `ieventplux://order/{ref}`) for mobile user agents — a small
  server-side TODO, not a client one.
- Universal/App Links (https:// scheme, associated domains) are **not**
  configured — would need `apple-app-site-association` / assetlinks.json on the
  web deployment. Not part of this scaffold.

## Development builds — exact commands

Prereq: `cd mobile && bun install` (or npm install), then
`npx expo install --fix` to pin SDK-52-native versions.

```bash
# Expo Go (no native compile) — enough for the attendee flow + barcode scanning
npx expo start

# Development builds (custom native code / not-for-Expo-Go features):
npx expo start --dev-client          # start Metro for a dev build

# Build & run the dev client on device/emulator (local toolchains):
npx expo run:android                  # Android device/emulator via adb + Gradle
npx expo run:ios                      # iOS Simulator (macOS + Xcode required)
npx expo run:ios --device             # iOS physical device (signing needed)

# Or use EAS cloud builds of a development client:
eas build --profile development --platform android
eas build --profile development --platform ios
```

A minimal `eas.json` for the two profiles above (add when adopting EAS):

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    }
  }
}
```

`expo-camera` and `expo-secure-store` are already listed in
`app.json → expo.plugins`, so a dev build requests camera + secure-hardware
permissions correctly on both platforms (camera permission strings can be
customized with the plugin's `cameraPermission` config when polishing).

## Server-side integration points (for the web repo owners)

1. **Mobile session token endpoint** — the API is cookie-only today; the client
   keeps a Bearer slot (`src/api/client.ts`) ready for a future
   `POST /auth/login?client=mobile` that returns a long-lived token.
2. **Hosted-checkout return redirect** to `ieventplux://order/{ref}` for mobile
   user agents (see Deep link caveat above).
3. **Offline sync conflict review** — `/checkin/sync` preserves CONFLICT
   results server-side, and the mobile scanner now surfaces them in its review
   panel (round 30). An organizer-dashboard review queue (server-side table of
   non-ADMITTED sync outcomes) remains a web-repo TODO for larger doors.
