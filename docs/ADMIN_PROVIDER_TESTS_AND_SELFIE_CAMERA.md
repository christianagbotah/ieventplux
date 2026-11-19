# iEventPlux: Live selfie camera and administrator message-delivery acceptance

Release scope: secure usability improvements following the 19 November 2026 verification and provider configuration launch.

## On-device manual selfie capture

**Organizer workspace → Settings → Verification → Take selfie** offers three paths:

- **Open camera with live preview:** Uses `navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } })` in a modal on HTTPS and asks the browser for front-camera permission. The video stream stays local; a JPEG is captured to a temporary `File` with Canvas and shown for manual review. The camera tracks are stopped on capture, cancellation and unmount. A review and separate identity consent precede upload.
- **Use device camera app:** Uses the mobile `capture="user"` file input, useful in browsers that cannot provide an in-app stream.
- **Choose existing image:** Android/iOS gallery or ordinary file picker. A temporary `blob:` preview is revoked on change/unmount. All three paths use the same encrypted KYC uploader with server-side content validation.

No liveness verification or biometric matching is performed by the manual capture. Smile ID guided liveness remains unavailable until the privacy notice, provider credentials/entitlement and sandbox verification gates are satisfied. This photo does not automatically approve an organization.

## Admin Console → Integrations → Email & SMS delivery settings

**Hubtel SMS test:** After configuring approved sender ID, client ID and secret, a platform SUPER_ADMIN enters a test telephone number in full E.164 international format (`+233...`), checks a consent/charge warning, and requests **Queue one test SMS**. The API validates membership, two explicit confirmations, recipient format, rate-limits to two per hour per admin and enqueues one real message to the normal delivery worker. It does **not** claim delivery on queueing. The **Message Log** shows `QUEUED`, provider `ACCEPTED` and subsequent `DELIVERED`, `FAILED` or unresolved outcomes where available. Real SMS may incur standard charges.

**SMTP verification:** After configuring SMTP, the super admin selects **Verify SMTP connection**. The server tries to authenticate using Nodemailer (TLS on 465 or STARTTLS on 587/2525). It sends no email, and returns a generic result without leaking raw provider errors or secrets. Maximum three attempts per hour per administrator.

**SMTP message test:** The admin enters an inbox they control, ticks consent, and selects **Queue one test email**. This uses the normal durable email delivery worker, maximum two per hour. SMTP server acceptance is **SENT**, not proof of inbox placement; the admin should also check the destination inbox and spam folder.

Provider credentials were not present in production during implementation, so no real SMS charges, emails or biometrics were triggered. After the platform owner configures credentials, perform controlled provider tests with their own phone/mailbox, inspect delivery log, and verify the sender domain's SPF/DKIM/DMARC before general release.

## Acceptance checklist

- Smartphone camera preview works over HTTPS, with device permission handling and no persistent stream after closing.
- Front-camera native capture and gallery fallback work if the in-app preview is unavailable.
- No identity file is uploaded before consent and a separate submit action.
- Anonymous users cannot invoke or inspect admin provider checks, saved credentials or KYC evidence.
- SMTP check is non-sending, only indicates server authentication, and does not disclose provider error bodies.
- SMS/email test messages must be requested deliberately by a SUPER_ADMIN, with recipient control/charges acknowledged.
- The message log displays the correct channel and distinguishes queued/accepted/sent/delivered states.
- Production build and staging smoke tests pass; authenticated browser visual tests remain outstanding until a test account/device is used.
