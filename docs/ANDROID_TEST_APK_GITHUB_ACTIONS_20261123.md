# Manual Android debug test APK build

GitHub Actions builds an Android debug APK on an isolated hosted runner so
Lightworld does not install the Android SDK/Gradle on the busy production VPS.

## To run
In the ieventplux GitHub repository open Actions → Android Installable Test
APK → Run workflow → main.

After a successful run, download the short-lived
ieventplux-android-debug-apk build artifact (retained for 7 days). Unzip
the artifact to get the app-debug.apk file.

## Safety and release limitations
- A debug-signed APK uses a disposable Android testing key generated on the
  isolated runner. It is not a production Play Store release; independently
  generated builds may not upgrade each other because signatures differ.
- Only install on authorized test phones/accounts.
- The build is manual-only, not hourly: Gradle consumes CI runner time.
- No iOS IPA is built. Apple signing and Apple-compatible infrastructure
  are separately required.
- No server secrets, live VPS env files or app store passwords are used.
- Passing Android compilation does not prove device camera/microphone or
  LiveKit calls. Real two-phone acceptance testing is mandatory.
- If GitHub-hosted Android build fails, inspect workflow logs and repair
  source/Gradle compatibility. Do not install SDK packages on production VPS
  without a separate capacity-reviewed build environment.

## Device tests
1. Install on an authorized Android device and sign in.
2. Test native camera/microphone OS permission prompts, camera preview.
3. Have two distinct entitled users join the same LIVE meeting and verify
   video, audio-only, listener-only, mute/unmute and leave/rejoin.
4. Test native community replies and attendee networking consent/follow,
   block, report, leave and private-profile behavior.
5. Record model, Android version, network type, and results before signing
   off native production readiness.

## Hosted SDK bootstrap correction

The initial test run (GitHub run 45235924168) failed before Gradle because
android-actions/setup-android@v3 invoked sdkmanager tools, an obsolete package
no longer available. The workflow now uses the SDK manager preinstalled on
GitHub Ubuntu runners, selecting the highest installed cmdline-tools version
and installing SDK 35/build-tools/NDK explicitly.

## Native CMake/Prefab diagnosis (23 November 2026)

The corrected SDK bootstrap build (run 45236385808) reached native
Android compilation, but Gradle failed with CXX1210 while configuring
expo-modules-core CMake for arm64-v8a, reporting no compatible library.
Hundreds of earlier Java/Kotlin/DEX tasks completed. No APK was uploaded.
The manual workflow now stores verbose Gradle diagnostics as a short-lived
GitHub Actions artifact when compilation fails, including Prefab resolver
context and generated ABI/architecture flags. The cause has NOT been
isolated; do not work around it by disabling security protections or by
installing a large Android toolchain on the production VPS.


## Prefab native-library mismatch diagnostics

The second attempt (GitHub run 45238683331) captured a 5 MB verbose Gradle
log but still returned only No compatible library found during
expo-modules-core:configureCMakeDebug[arm64-v8a]. Gradle maps a Prefab CLI
exception to generic CXX1210 and strips the exact incompatible library
from the final task error. A native-library mismatch cannot be repaired
safely from that generic error alone.

A new manual checkbox diagnostics_only runs just the failing CMake
configuration task and captures generated Prefab stderr files, CMakeCache
and native command logs in the separate ieventplux-android-prefab-logs
artifact (7-day retention).
When diagnostics_only=true, no APK is produced or uploaded.
A full assembleDebug run must subsequently pass on the fixed revision.
