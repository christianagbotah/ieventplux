# iEventPlux — Global creator/social expansion (20 November 2026)

## Product direction
iEventPlux is an events-first global community platform. People should be able to
create and discover real experiences, follow individuals and organizations, publish
their own authentic media, join gatherings remotely, interact with communities,
and purchase authorized admission or merchandise. Event participation—not vanity
views or a copy of a generic social network—is the differentiator.

**No technical work alone guarantees billions of users, revenue or valuation.**
Capacity is proved through published SLOs, measured load tests, independent
security review, regional compliance and operational readiness.

## This draft social/reels increment
- Public Reels remains limited to event-linked READY clip records and active
  organizations. An ineligible linked next event is suppressed rather than
  leaking invite-only/unlisted/removed/draft details.
- Browser-native HTTPS MP4/WebM content can be played intentionally with a
  real Play/Pause control; unknown provider URLs and artwork remain honestly
  labelled previews. The player does not claim transcoding, adaptive streaming
  or verified rights.
- Only the active reel may continue playing; users initiate playback to avoid
  unwanted cellular bandwidth, audio and battery consumption.
- Signed-in viewer reactions are read from their own account, can be toggled
  with rollback on failed writes, and can be made only on eligible public
  content. A reaction is NEVER counted as a video view.
- Users can report clips with a reason. Authorized moderation staff can
  remove a reported media record from public discovery without modifying
  financial entitlements.
- No schema change and no payment/provider changes are required for this PR.

## Release gates
1. Bun policy tests, web and mobile typechecking, standalone build and smoke.
2. Real device UAT on Android and iPhone: scroll, Play/Pause, report dialog,
   focus/screen reader, slow networks, reaction sign-in, reconnect and no
   phantom Likes on API failure.
3. Authenticated security QA against a **synthetic staging dataset**:
   private/removed event and org target IDs cannot be reacted to, foreign
   users cannot read the reaction ledger, and staff can remove MEDIA safely.
4. Transcode provider and direct-creator-upload pipeline remain OFF until the
   vendor contract, file validation, content scanning, copyright, deletion,
   signing and storage economics have been reviewed.
5. No automatic production merge/deploy; preserve ongoing work on main and
   keep promotion gated on passing CI and live-service smoke.

## Development sequence to reach a true global social network
### S1 — Creator content and video delivery
Owner-authorized uploads; presigned resumable transfers; MIME + actual file
inspection; object scanning; storage-quota enforcement; transcoding to
device-appropriate renditions; HLS delivery with regional CDN; posters and
captions; publish/failed/removed lifecycle; rights declarations and takedown
workflow; content retention policy. Never expose provider signing secrets to
browsers.

### S2 — Social identity and interaction
Public user creator profiles, bio/links and privacy choices; verified creator
claims; separate user-generated posts and comments; organization and personal
following; mute/block/report; controllable notifications; media reactions with
a uniqueness constraint and atomic toggles; creator editing and deletions;
appeals and moderation audit; youth and harassment protections.

### S3 — Home and creator discovery
Three distinct feeds: Following (chronological and private), Discover
(transparent recommendations), and Clips (real media). Relevance may incorporate
opt-in interests, location selected by the user, event date, language and
prior attendance, but must not imply an event or viewer count that does not
exist. Clearly label sponsorship, expose why a recommendation appears and
offer "not interested" and notification controls.

### S4 — Shared online participation
Signed attendee entitlements for live and replay; moderated comments, polls
and Q&A; livestream captions and accessible controls; region-aware join times,
provider failover and secure archives. Organizers must not accidentally expose
paid streams to non-ticket holders.

### S5 — Commerce and international deployment
Keep supported checkout regions explicit; adapt regulated payments, taxes,
refunds, disputes and payouts region by region. Geo/CDN strategy, idempotent
jobs, distributed abuse limits, read replicas, media edge caching, disaster
recovery and staging load tests come before broader rollout.

## Metrics that must come from real events
User/creator activation, weekly retention, video *qualified* playback starts,
completed plays, watch seconds, creator follows, event clicks, free RSVP and
paid conversion, real attendance, refunds, abusive content reports, support
response, latency/availability and infrastructure cost per active attendee.
Do not turn reactions into view metrics, nor invent public user numbers.
