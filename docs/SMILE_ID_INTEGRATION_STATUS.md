# Smile ID biometric verification — integration checkpoint (2026-11-19)

## Status

**Server-side V3 SDK integration implemented but NOT activated on the live platform.**
The production environment currently has no Smile ID partner ID, API key, or separately published biometric privacy notice. `SMILE_ID_BIOMETRIC_ENABLED` defaults to off. The organizer-facing official Smile ID SmartCameraWeb capture is now integrated and appears only after the server reports a configured, explicitly enabled provider with a privacy notice. Do not claim that a selfie uploaded for manual KYC is a liveness check.

The official `@smileid/usesmileid-nodejs` V3 SDK is installed. Private organization-specific endpoints are implemented for authorized owners/admins:

- `GET /api/v1/orgs/{id}/identity-checks`: masked readiness and up to eight provider jobs; no identities, images or secret keys exposed.
- `POST /api/v1/orgs/{id}/identity-checks`: **fail-closed until activated**; accepts fresh `multipart/form-data` including `givenNames`, `lastName`, `biometricConsent=yes`, a JPEG/PNG `selfieImage`, JPEG/PNG `document`, optional `documentBack`, and 2–12 SDK-generated JPEG/PNG `livenessImages` (provider controls frame count). Calls the actual Smile ID V3 Document Verification SDK method using separate consent and does not persist biometric bytes in our database. Authentication, organization management role, input validation and rate limiting are mandatory. The organizer UI now provides a gated guided camera journey, using Smile ID SmartCameraWeb to collect selfie and liveness frames and ID front/back. Real provider interaction still requires sandbox/live credentials and provider entitlement.
- `POST /api/v1/orgs/{id}/identity-checks/{jobId}`: server-authenticated status polling with a 30-second minimum interval; a user cannot set their own verification result.
- `GET /api/v1/orgs/{id}/kyc`: manual KYC records plus latest five provider result statuses visible to authorized organizers and platform finance reviewers.
- `POST /api/v1/admin/orgs/{id}/verify`: remains a human decision. Reviewers must document a reason (minimum 20 characters) for manually approving after a latest provider check that is not `CLEAR`.

Provider statuses: `SUBMITTING`, `PROCESSING`, `CLEAR`, `BLOCK`, `REVIEW_REQUIRED`, `ERROR`. **None automatically changes organization verification or payout eligibility.** A `CLEAR` only indicates the provider's automated check, and human document inspection remains mandatory.

### Production setup (after legal/contract approval)

Set these in the private production environment, never in Git or the browser:

```dotenv
SMILE_ID_PARTNER_ID=
SMILE_ID_API_KEY=
SMILE_ID_ENVIRONMENT=sandbox
SMILE_ID_BIOMETRIC_ENABLED=0
SMILE_ID_PRIVACY_NOTICE_URL=
```

The explicit activation flag must remain `0` until the integrated camera and liveness capture have passed an authenticated sandbox acceptance test, the contract and Ghana regulatory requirements have been reviewed, a specific HTTPS biometric notice has been published, and the owner has approved any pay-per-check charges. Start in sandbox with provider test identities; production credentials and environment are separate. Confirm all behavior with real Smile ID sandbox feedback before marking this feature live.

### Privacy and audit

- The biometric notice must identify the third-party provider, biometric/document purposes, legal basis and consent, retention, data subject rights, subprocessors and transfers. A separate explicit consent is required; ordinary manual-upload consent does not authorize third-party biometric submission.
- No provider API key, personal face image, ID number, provider raw response, or confidence score is persisted in `KycProviderJob`. The table retains only references, consent time, provider status, country and privacy notice URL. Audit events contain job IDs and sanitized decisions only.
- The existing encrypted private KYC uploads and human review continue unchanged.
- When retiring or replacing the provider, follow the privacy notice and data retention process; do not retain biometric data indefinitely.

### Database and deployment

Run the additive migration `scripts/migrations/20261119_identity_provider_jobs.sql` after a private database backup and **before** rolling out the code. The migration creates `KycProviderJob` and enforces one active provider job per organizer. No existing organization documents or event data are changed. There is no destructive `db push`.

### Remaining before real live identity checks

1. Obtain and validate Smile ID sandbox credentials and Ghana Card/document product entitlement.
2. Complete a legal review and publish the provider-specific biometric privacy notice.
3. **Implemented (needs authenticated phone/browser acceptance test):** Integrate Smile ID SmartCameraWeb for guided selfie, liveness, front/back document capture and separate consent. The ordinary manual selfie uploader remains entirely separate.
4. Exercise an end-to-end authenticated phone/browser sandbox test and review provider decisions/error cases, callbacks/polling, retry, retention and financial charges. Do not promote solely based on a successful HTTP 202 response.
5. Enable live production checks only when the above are signed off. Sandbox decisions are for testing, not a substitute for legal identity verification.

## Sources

- https://docs.usesmileid.com/ — current V3 service/API overview.
- https://smile.id/countries/ghana — Ghana supported identity verification.
- https://www.npmjs.com/package/@smileid/usesmileid-nodejs — official V3 server SDK.
- https://www.npmjs.com/package/@smileid/web-sdk — official Web SDK for assisted capture.
