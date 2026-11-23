# iEventPlux Android QA publication and update checks

## What has been implemented

1. A successful CI workflow on GitHub main that includes changes
   under mobile/ or the Android build workflow dispatches a new
   standalone QA APK build. An outdated CI SHA is ignored, and
   web-only changes do not cause needless native app updates.
2. The standalone release variant embeds the source commit SHA
   and timestamp into Expo app metadata before native prebuild.
3. Its APK must pass signature and embedded-JS-bundle checks.
   A dedicated MAIN-ONLY job with narrowly scoped write permission
   then publishes an immutable public GitHub prerelease tagged
   android-qa-<7hexsha>, including the installable app-release.apk.
4. The public Android QA release API fetches only actual GitHub
   prereleases in the official repository, validates their tag,
   official download URL and APK size, and caches responses. A
   push to GitHub alone cannot trigger a false download alert.
5. The native app checks that server release API on launch and
   when brought back from the background. It compares revisions
   and timestamps, and renders a modern native update dialog
   offering Download update and Not now. Offline checks fail
   silently; app use is unaffected.

## Test checklist

- Verify a published QA APK exists at
  https://github.com/christianagbotah/ieventplux/releases
- Verify public release endpoint
  https://ieventplux.lightworldtech.com/api/v1/mobile/releases/android
  reports platform android, channel qa, latest revision and
  official GitHub download link.
- Open an APK with matching revision: no update dialog.
- Publish a newer verified QA build: next launch/foregrounding
  of the older build should show the update dialog.
- Tap Not now: app stays usable; next fresh app session should
  prompt again if newer release is still available.
- Tap Download update: only the official GitHub release asset
  should open. No silent installation or payment involved.
- Test offline mode; app must not crash or block login and events.
- Verify unsigned/unpublished builds never enter the update feed.

## Certification, signing and app-store limitations

The APKs are internal QA packages currently using test/debug signing.
Earlier runner-generated debug keys are not stable between builds,
so Android may reject an in-place replacement. Provision a stable
non-production test-signing key through approved GitHub secrets
before claiming seamless upgrades; otherwise a test user may need
to uninstall and reinstall. Production app-store signing, Play Store
managed updates and iOS TestFlight distribution are separate tasks.

The current downloadable APK was built before the update checker
existed; it cannot display these notifications. The next verified
APK with the updated native source enables them.
