# iEventPlux mobile meeting crash recovery

A staging browser may remain open across multiple web releases. When the visitor
taps Join Meeting, React loads the meeting screen and LiveKit media UI lazily.
If an old content-hashed JS chunk is absent, Next.js returns 404 and the
unhandled import can display a full-page client exception.

Diagnosis on 22 November 2026: one previously deployed chunk returned HTTP 404
until its file was retained on the active release and the Next.js server
restarted, after which HTTP 200 was confirmed. This supports the stale-asset
explanation, although an Android media-specific issue cannot yet be excluded.

The lazy meeting screen and SFU region now have separate React error boundaries.
A failure presents an accessible reload action rather than crashing the portal.
A video UI error does not take down the independently authorized chat.
Only non-sensitive error metadata reaches the browser console.

The tested scripts/preserve-client-assets.sh script copies missing immutable
versioned resources from prior builds into the next release before web startup,
never replacing the latest build artifacts. This is added as a systemd
ExecStartPre action on the existing staging hostname.

Real camera/microphone/remote-participant join on the user's Android device
still requires hands-on UAT, independent of synthetic browser smoke tests.
