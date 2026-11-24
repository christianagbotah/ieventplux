# iEventPlux — Native Premium Visual System

## Design direction

The app is a native React Native/Expo product. It must *not* simulate its entire interface with browser redirects. Web and mobile share the same product vocabulary, trusted API/backend, events, identities, and brand color tokens; screen layouts should **adapt to mobile**, not replicate a desktop webpage pixel-for-pixel.

The original native UI had disconnected ad-hoc colors and tiny text, generic square cards and insufficient content hierarchy. Color parity alone was not adequate.

## New shared visual foundations

`mobile/src/ui/PremiumUI.tsx` provides reusable, native components and a tokenized styling vocabulary:

- **PremiumBackdrop** — device-resolution-independent native SVG gradients, soft halo rings and abstract strokes; no remote hero image dependency, no WebView.
- **SectionHeading** — consistent, readable editorial typography, optional eyebrow/subtitle/action.
- **SurfaceCard**, **PremiumButton**, **LabelPill**, **TileGlyph** — consistent tactile surfaces, buttons, badges and original lightweight SVG glyphs.
- **Palette** — web-matched #087a6d emerald, #f5f7fa canvas, #162333 ink and #e5eaef border, with complementary deep-evergreen hero surfaces and restrained gold accents.

## First implementation pass

| Native view | Changes |
| --- | --- |
| Six-tab navigation | Raised floating white dock, rounded outline, icon treatments, deliberate active state, safe-area-aware layout |
| Discover | Branded SVG-gradient editorial carousel, larger type and actions, search depth, emphasized spotlight/live rail, richer photo-led event cards, clearer price and online mode |
| Account | Modern identity profile, profile image/initials, real membership count, 2×2 quick-launch grid, explicit web-only badges for advanced tools |
| Marketplace | Distinct branded hero/search, transparent read-only commerce notice, image-led verified seller cards, store marks and branded category/location metadata |
| Ticket wallet | Premium pass header, clearly segmented Tickets/Orders, perforation-style ticket metadata, QR prompt, retained offline credential behavior |
| Login | Matching branding/hero atmosphere, form spacing and button hierarchy, existing authentication preserved |
| Organizer Studio, onboarding and editor | Unified premium hero/backgrounds, updated native cards and creator buttons, established server authorization unchanged |

## Certification gates and ongoing work

The implementation is **source/UI modernization, not device-certified visual parity**. Before calling it finished:

1. Obtain side-by-side Android and web screenshots at approximately 360px, 390px and large phone width. Review iOS screen layouts independently.
2. Validate 200% text scaling, accessibility labels, 44pt touch targets, visual contrast, safe areas, navigation keyboard interactions, horizontal lists and scroll positions.
3. Test event photos, empty states, ticket QR presentation, checkout handoff and live meeting permissions on a physical Android device.
4. Continue applying system to Following, Reels, event/networking/voting, LiveKit meeting room, event management, storefront details and camera scanning. Some of these already have independent styling and should be reviewed, not blindly overwritten.
5. Do not claim real video reels, completed native shopping checkout, identity verification uploads or automatic Android installation merely because the screen is attractive.

CI must pass TypeScript, native unit tests, web integration and the signed QA build. The final visual signoff requires actual screenshots or a device session; a successful compiler is **not** a visual QA pass.

## Second native visual increment — social, Live, and event details

The native-only visual system is extended to four more high-traffic destinations:

- **Following:** editorial gradient hero and real followed-organizer count, personalized activity feed with richer organization identity and image-led cards, native guest onboarding, honest empty state. The feed is cleared on logout/account transitions, and stale in-flight requests do not repopulate private activity under a different session.
- **Event previews (Reels):** immersive editorial artwork cards, branded organizer identity, clear native Love/Share/Event buttons, real event destinations and event-next-occurrence CTA. The design still labels these as **event previews**. It does not claim playable videos or synthesize missing creators/media from sample data. Poster URL normalization accepts the API's existing relative-media pattern.
- **Live:** full native hero, genuine live-broadcast count, image-led cards, reliable relative artwork paths, retry/refresh and honest empty states. Only broadcasts the server reports `LIVE` are shown.
- **Event details:** image-led cover, stronger date/venue/community hierarchy, clean 2×2 native community/meeting/network/voting shortcuts, better checkout summary, and 44px ticket quantity controls. Order creation, inventory limits, free RSVP and Hubtel hosted checkout remain **server-authorized and functionally unchanged**.

Native social cards never silently switch to web-based content. Exception: the user-initiated system share sheet can share a public website event URL, and secure payment authorization can open the hosted provider as before.

**Acceptance limits:** Source checks, TypeScript and CI bundle success do not certify these screens on actual devices. Review small Android phones, long event names, large accessibility font scaling, absent artwork, network retries, safe area and 2×2 shortcut wraps; then compare iOS separately. The verified QA APK is the correct deliverable for on-device visual feedback. The Reels API must gain actual playable media and rights/moderation checks before presenting the screen as a full TikTok-style video player.

## Third native visual increment — community, networking and award voting

- Community discussion now uses the same gradient editorial hero, modern moderated feed cards, user avatars, clearer composer/quick-start prompts and real threaded replies. Success messages are differentiated from errors; pending loads are revision-guarded to prevent a stale private response from overwriting a later result.
- Attendee networking now uses native premium profile, consent and privacy panels. The roster remains opt-in, restricted by backend attendee eligibility and reloaded only after server confirmation. Relative avatar image paths are normalized; leaving the network clears the sensitive roster and invalidates outstanding requests.
- Awards & supporter voting now use category sections, stronger nominee photo cards, legible status/availability and genuine published vote counts only when the backend marks counts visible. This remains **one free vote per account/category** and the existing authenticated server-authorized ballot. Payment and vote ranking are not invented in the UI.
- `ActionDialog` provides consistent React Native confirmation modals (including destructive-action styling) for consent, moderation and voting. This is a native modal, not a JavaScript browser prompt.

On-device visual QA and accessibility scaling remain necessary. The current build does not claim real live voting commerce, unlimited meetings, full social video reels or iOS release signing.

## Fourth native visual increment — Meeting Access and LiveKit room

- Meeting Access now emphasizes direct native joining, with the same premium SVG hero and branded device-permission cards. Android/iOS camera/microphone requests are explicit and tied to user gestures. System-browser opening is labeled as a **fallback**, not the primary joining method. Permission errors appear as native inline notices instead of `Alert.alert`.
- The true LiveKit native room now has a stronger on-air header, clear secure-connection status, rounded participant video tiles, improved audio/video controls and a clearer leave button.
- **Listener-to-speaker permission fix:** When an attendee initially joins with camera/mic disabled and later enables a device inside the room, Expo asks the OS permission directly if not already granted, before invoking LiveKit `setCameraEnabled` or `setMicrophoneEnabled`. This fixes a missing permission-request opportunity but cannot guarantee OS grant; physical-device QA is required.
- Participant videos remain **paginated 8 visible tiles at a time** for mobile performance, NOT capped at 8 participants. Server admission and SFU capacity are separate infrastructure concerns; no invented unlimited-load certification.
- The older web meeting route remains a user-initiated secure fallback, and phone screen capture/sharing remains explicitly unsupported. LiveKit native media requires the custom development/QA APK, not Expo Go.

Acceptance: verify camera and mic first permission, previously denied permission, device settings round-trip, listener-to-speaker toggles, 2+ concurrent real devices, network reconnect, leave behavior and user consent. A static unit test or compiled APK alone is not a proof of working media.
