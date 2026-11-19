# iEventPlux — live selfie, identity and liveness verification

**2026-11-19 implementation update:** The server-side Smile ID V3 adapter, database jobs,
authenticated check-status polling, explicit-consent gate and provider-review trail
are implemented (not activated). The guided browser camera flow is integrated but needs a real browser sandbox acceptance test; provider credentials and privacy notice are outstanding. See [SMILE_ID_INTEGRATION_STATUS.md](SMILE_ID_INTEGRATION_STATUS.md)
for the current engineering status and activation checklist.

**Current state: no live provider connection configured.**
Existing ID (front/back), selfie and organization-registration evidence are privately stored encrypted and manually reviewed. Uploading a selfie does **not** identify a person or establish liveness. Do not label the user "biometrically verified" until a real, authenticated provider result is received and reviewed.

## Recommended provider for Ghana: Smile ID

Sources (validate onboarding contract/product activation with the vendor):
- https://smile.id/countries/ghana — Ghana document verification, selfie comparison and liveness capabilities.
- https://docs.usesmileid.com/products/biometric-authentication — SmartSelfie and liveness; a plain uploaded selfie is **not** equivalent to an SDK-managed live capture.
- https://github.com/smileidentity/smile-identity-core-js — official server SDK and signed-job utilities.

## Activation workflow (not yet implemented)

1. Create a merchant/partner account and obtain access to Document Verification (Ghana Card/passport, etc.), liveness and face-to-document match, with sandbox and production keys and known pricing. Do not commit API keys to Git.
2. Decide whether the provider's **hosted Web capture/SDK** can work across iEventPlux web and mobile. Prefer a live camera challenge over a static camera-roll selfie. A selfie on its own only provides a face image, not proof of legal identity.
3. Collect a **separate explicit and informed consent** for transmitting face images and IDs to the named third-party service, including purpose, destination, retention, data subject rights and cross-border processing arrangements. Existing consent currently covers **encrypted in-house manual review only**.
4. Create a server-only job with a unique unguessable reference bound to an authenticated user and their organization KYC case. Capture the provider's reference and status as pending; ensure idempotency, rate limits and encrypted minimal metadata at rest. Keep keys private.
5. Verify the vendor's signed callback/job-status response using the official SDK; match it to the original job and user; use anti-replay protection. Store only necessary result metadata. **Do not** accept a client-provided `verified=true` flag or a callback with no verified signature.
6. Treat mismatches, liveness failures, inconclusive findings and unsupported IDs as `REVIEW_REQUIRED`, with human appeal/retry, not automatic irreversible rejections. Never conflate an approved biometric check with company-registration or payment-provider approval.
7. Confirm Ghana Data Protection Act 2012 (Act 843) duties and Data Protection Commission guidance, lawful basis, provider agreement, retention/deletion, and security assessment before moving to production.

**Cost:** A genuine provider integration ordinarily involves account approval and usage charges. No fake or local face-recognition test is provided to imply live national-ID verification.

## Venue map service

The new venue picker uses Leaflet and OpenStreetMap tiles with contributor attribution; the picker requires a deliberate click to access browser GPS. At higher commercial volume, procure a suitable map-tile provider or self-host tiles rather than depending on the community tile service without checking usage policy: https://operations.osmfoundation.org/policies/tiles/ . No third-party geocoding or user-location lookup is performed when the page opens.
