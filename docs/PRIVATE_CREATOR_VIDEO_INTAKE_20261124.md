# Private creator-video intake foundation — 24 November 2026

**Status: code-ready for guarded testing, not a public release feature.** Real social-video creation and sharing cannot be represented by synthetic posters. The first step is to accept original media without giving the public access to unreviewed content.

## Endpoint and permission contract

- `POST /api/v1/uploads` multipart with `kind=CLIP`, a genuine `video/mp4` or `video/webm` File, `eventId`, `caption`, `rightsConfirmed=true`, `consentConfirmed=true`.
- Must be authenticated and have organizer `media:manage` for that event; the event must be active/not cancelled, undeleted, and belong to an active organization.
- `IEVENTPLUX_CREATOR_VIDEO_UPLOAD_ENABLED` defaults **false**. Setting it to `true` enables **private intake only**, not public playback. Review with platform operations before enabling on the sole hosted environment.
- Max 25MB per file, 12 pending items per organization, existing upload rate limit 20/min and basic MIME/container magic checks. These do not constitute video-decoder validation, security scanning, rights verification or moderation approval. Concurrent-queue overrun prevention and global quota/retention are pending before public scale.
- Accepted bytes go to `${IEVENTPLUX_UPLOADS_DIR}/pending-creator-videos/<uuid>.mp4` (or `.webm`), with a private directory and owner-only file permissions. This directory is not served by the public UUID-image upload route. The DB `MediaAsset` record uses internal non-HTTP `pending-video:<uuid>` locator and status `PROCESSING`.
- Upload response deliberately excludes the private locator; only `id`, `eventId`, `kind`, `status`, and sanitized caption are returned.
- `GET /api/v1/orgs/:id/clips` is media-manager scoped, private/no-store, and reveals only non-file metadata, organization-owned events and status; never a raw file path. The endpoint cannot approve or publish clips.
- Public `/discovery/reels`, organizer profile clips, and `/events/:id/media` exclude pending assets and enforce READY-only content visibility. No raw private upload may reach viewers through those routes.

## Production blockers and further work

1. Malware scanning, independent human moderation, consent/right confirmations with durable audit evidence, illegal-content reporting and appeals, codec validation, safe transcoding, thumbnails, format limits and storage lifecycle/retention.
2. Atomic global/per-org quotas, safe multipart streaming (current parser buffers at most the bounded file size in memory), content moderation processing queue and legitimate reviewer approvals.
3. Publish-only reviewed, transcoded assets to public UUID MP4 URLs with secure byte-range serving, policy enforcement and appropriate CDN and global distribution. This is **not** included in this intake change.
4. Native creator video picker/camera recording with organizer consent UI, upload progress, retry/cancel, status updates and accessible media review. The separate mobile Reels playback PR is a reader and cannot make unpublished assets playable.
5. Device and VPS operational QA, including available storage (VPS was approximately 90% occupied when this was developed), permission denial, web/admin rights checks, and no accidental public access. Do not enable the pilot on the hosted instance until operational readiness is confirmed.

This design intentionally refuses the dangerous shortcut of setting freshly uploaded user video directly to `READY` or making pending files web-accessible.
