# Native LiveKit SFU milestone — 23 Nov 2026

The source integrates LiveKit React Native with the existing self-hosted
iEventPlux SFU and server-issued authorized meeting admission tokens.

## Implemented native source
- LiveKit React Native 3.2.0, WebRTC 150.2.0 and Expo plugin 1.2.0.
- Expo SDK 52-compatible WebRTC plugin 10.0.0 and dev client 5.0.20.
- Camera/mic/listen-only options; OS prompts only for selected devices.
- Same backend LIVE meeting, ticket, RSVP and ban gates as the web version.
- Token and WSS URL validation; no private signing key shipped to phones.
- Mic/camera controls, Leave, audio session and paginated video tiles.
- Remote screen-share video can be viewed in the native room.
- Every 15 seconds revalidate user admission and meeting state with the API.
- Expo Go does not load native WebRTC and falls back to the browser.
- Development, preview and production build profiles in mobile/eas.json.

## Verification and limits
TypeScript, unit tests, Expo Android prebuild and Android/iOS JavaScript
exports are the source checks. APK/IPA builds, cross-device audio/video
testing, iOS device tests, speaker routing, background/reconnect behavior
and native phone screen-share publishing are NOT certified.

EAS profile configuration does not link an EAS project, install signing
credentials or submit a cloud build. No paid provider, schema change
or staging server switch is needed for this mobile-only branch.
