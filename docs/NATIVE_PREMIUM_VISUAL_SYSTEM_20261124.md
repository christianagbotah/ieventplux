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
