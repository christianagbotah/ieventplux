# iEventPlux camera/microphone and native/mobile parity audit

## Confirmed current state
The web application uses LiveKit/SFU and calls getUserMedia on the user's
Join tap. In-app browsers such as TikTok, Facebook and Instagram can suppress
or reject device capture when the host app has no media-permission bridge.
A website cannot bypass the OS or host application permissions.

The separate mobile/ React Native/Expo SDK 52 application existed but did
not have the web's meeting screen, community/networking pages, or a native
WebRTC engine. GitHub's existing mobile checks were only unit tests and
TypeScript; they were not Android APK/iOS IPA installation tests.

## This round
- Web room: optional individually triggered Test Camera / Test Microphone
  actions; each obtains a temporary stream, reports device-specific errors and
  stops all tracks. Embedded-browser advisory and copyable secure meeting
  link for opening in Chrome/Samsung Internet; no claims of overriding OS.
  A listener can still join with both devices off.
- Native Expo: explicit camera/microphone permission descriptions for Android
  and iOS; MeetingAccessScreen in navigation and event details, using native
  expo-camera permission hooks. Camera preview remains local, no upload.
  Status can be rechecked; OS settings can be opened if permission denied.
- Mobile meeting discovery uses authenticated GET /events/{id}/meeting, then
  opens the secure server meeting in the system browser (not embedded WebView).
  Browser cookies are separate; users may need to sign in again.
  This is a clearly labelled interim route, NOT a native in-app video call.
- expo.extra.apiBaseUrl defaults to the existing iEventPlux staging domain
  for mobile source testing; EXPO_PUBLIC_API_BASE_URL retains precedence.
- Mobile CI now verifies Android and iOS Metro bundle export along with tests
  and TypeScript. Exportable JS bundles are NOT APK/IPA builds.

## Native parity backlog
A native LiveKit/WebRTC meeting (camera, mic, speaker, screen sharing, adaptive
audio/video, disconnect, permissions, room token and secure attendee admission)
requires compatible native modules and an Expo custom development build.
It is not shipped in this change. Likewise, the separate native app still
lacks several current web features: event community threads, opted-in
networking, AI discovery/planners, full organizer console, and creator studio.
Implement them using the same v1 APIs and parity tests, rather than pretending
web-only changes automatically update compiled mobile binaries.

## Acceptance testing
1. In Chrome/Samsung Internet on Android, navigate to any LIVE entitled
   meeting; tap Test camera, Test microphone separately, then Join.
2. Repeat in TikTok in-app browser: verify clear recovery link/instructions.
3. Use a real Android development build to verify native camera preview, mic
   permission, default secure API, meeting status and external link handoff.
4. Real 2-device audio/video, screen sharing, iOS hardware tests and signed
   APK/IPA store distribution remain REQUIRED for production certification.
