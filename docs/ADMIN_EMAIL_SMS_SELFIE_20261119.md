# iEventPlux verification selfie and platform messaging setup

Date: 19 November 2026. The interface must distinguish photo-based manual review from Smile ID biometric checks, and configured email/SMS credentials from verified real deliveries.

## 1. User selfie and private KYC

Go to **Organizer workspace → Settings → Verification**. The verification checklist and upload form show separate buttons for **ID front & back**, **Take selfie**, and (where required) **Registration documents**. To take a selfie on a phone:

1. Choose **Take selfie** and **Open front camera / Take selfie**. On browsers that support `capture="user"`, the handset offers the front-facing camera. If the browser does not expose the camera, choose the gallery instead.
2. Preview the selected image locally; take another photo if necessary. A 200×200 pixel or larger, readable image is required by the secure KYC uploader.
3. Read and tick the manual identity review consent checkbox. Tap **Securely upload selfie**. The file is never transferred before explicit upload and is stored as encrypted KYC evidence accessible only to authorized reviewers.
4. Upload both sides of the government ID and any required school/company registration record. A manual reviewer assesses the evidence. No app UI action automatically approves an organizer.

**Live Smile ID guided liveness and automated identity matching are NOT active on production** without provider credentials, service entitlement, published biometric privacy notice and verified sandbox testing. A normal selfie is not evidence of biometric match or a liveness check. Never imply otherwise.

## 2. Hubtel SMS — independent from money movement

A **platform SUPER_ADMIN** goes to **Admin Console → Integrations → Email & SMS delivery settings → Hubtel SMS**. Enter a valid Hubtel SMS Client ID, Client Secret, and a sender ID approved for SMS by the provider. Click **Save SMS settings**. An empty field keeps the current stored value. This does not modify the Checkout or Send Money keys.

The **SMS Log** displays provider-accepted vs delivered/failed/suppressed messages; provider acceptance is NOT proof the phone received a message. A sender ID must be approved and real delivery tested before advertising SMS as working. If production SMS credentials are absent, delivery is labelled **unavailable**, never simulated.

The legacy shared Hubtel connection form is retained for checkout/payout credentials. It also populates SMS credentials for compatibility, so use the dedicated SMS panel if connecting only the SMS service.

## 3. SMTP email — dynamically configurable by platform admin

In the same **Email & SMS delivery settings** panel, enter:

- **SMTP hostname**: publicly resolvable domain such as `smtp.example.com`, no protocol, no localhost/internal host, no IP address.
- **Port**: `465` for TLS, or `587`/`2525` for STARTTLS.
- **SMTP username**: issued by the mail provider (usually full mailbox address).
- **SMTP app password / API secret**: mail-provider-supplied credential. This field is write-only, and the DB stores an AES-256-GCM encrypted value using a key derived from the server secret; the browser never sees the saved value.
- **Sender email (From)**: verified email address such as `ieventplux@lightworldtech.com`.

Click **Save SMTP settings**. Background workers resolve the credentials from the database, with existing `SMTP_*` environment variables as fallback; no web redeploy is needed. A saved/available status does not verify provider connectivity, authentication, SPF/DKIM/DMARC, inbox arrival, or safe sender reputation. Complete an end-to-end test using a controlled destination before enabling customer-facing email commitments.

Queued email is marked `SENT` only after SMTP server acceptance, not `DELIVERED`; suppress when configuration is absent. The generic platform-settings API may no longer reveal provider secrets and cannot mutate credential keys.

## 4. Security and acceptance checks

- Only platform SUPER_ADMIN can save or see masked SMS/SMTP configuration.
- No SMTP password, Hubtel secret or API token ever appears in generic `/admin/settings` responses.
- No password is included in audit change metadata.
- No SMS delivery or email inbox success is claimed without real provider confirmation.
- Revalidate responsive mobile KYC screen (camera permissions, front camera, image preview) on an actual Android handset after release.
- Provider credentials and Smile ID biometric verification remain **unconfigured** until the platform administrator enters and tests real accounts.
