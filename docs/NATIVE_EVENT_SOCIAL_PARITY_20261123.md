# iEventPlux mobile parity — communities and attendee networking

## Scope
- Real native event-detail links for both social features, with native
  React Native views (not WebViews or browser pages).
- Community screen: root post list (12/page), first 40 visible replies per
  conversation, writing prompts, explicit post and reply, refresh and page
  continuation, read-only event behavior, moderator/author removal, report to
  platform moderation, and a themed confirmation dialog.
- Attendee networking: no roster without server-confirmed eligibility and
  affirmative opt-in by the *viewer*. Join and leave require confirmation.
  Other participating members consent independently. Display name, profile
  photo and follow state only. Follow/unfollow, report and block run against
  existing social APIs. Members are never cached offline.
- Server remains the only source of truth for eligibility, visibility,
  private events, payment / RSVP access, blocks and account status.
- API errors 401/403/404 in community clear all displayed posts; network
  errors clear identities immediately and require a fresh authorized request.
- No new DB tables, credentials, external providers or backend updates.

## Verification
- Native TypeScript, all 48 mobile tests (44 previous + 4 social policy),
  Android and iOS Metro JavaScript exports and existing CI suite are gates.
- Device test still needed for iOS/Android screen layouts, native dialog
  accessibility, keyboard avoidance, pagination on low-bandwidth networks,
  membership revocation, and two-account report/block/consent.

## Mobile/web parity known gaps
The native app still lacks several web workflows: full organizer creation and
editing, AI event discovery, media studio, group community management across
events, native mobile screen-share publishing, complete notification management,
and advanced ticket/event sales administration. This increment does not claim
the entire mobile product is production ready.

## APK/IPA release blockers
The authorized VPS has Java but no complete Android SDK/platform/build-tools
installation, and no authenticated signing or EAS build configuration; its
existing production services are resource-constrained. We are not installing
multi-GB build tools or modifying production services in this increment.
The existing mobile/eas.json contains profiles, but does not create a
signed, distributable app or link an Expo account. iOS signed builds require
Apple developer credentials and Apple-compatible build infrastructure.
