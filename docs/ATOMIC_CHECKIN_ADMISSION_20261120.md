# iEventPlux: atomic check-in with multiple scanners

The previous check-in flow read ticket.status before updating it
unconditionally. Two scanners could both see VALID and each report ADMITTED,
overwriting check-in timestamps and producing duplicate admission audit rows.

The new PostgreSQL transaction uses conditional updateMany where the ticket
ID, event ID, and status VALID all match. Exactly one transaction can change
VALID to CHECKED_IN. The same transaction writes its ADMITTED audit record.
If the audit write fails, both changes roll back.

Other scanners re-read the current status and log DUPLICATE (online),
CONFLICT (offline sync), or INVALID (refunded or revoked) without ever
overwriting the first check-in. A simultaneous request reusing exactly the
same client scan ID can hit the unique constraint; the losing transaction
rolls back and can replay the stored outcome only after event, staff, and
ticket credential validation. This retains earlier anti-PII safeguards.

CI uses a disposable local PostgreSQL database with synthetic ticket
records to test two simultaneous scanners, audit outcome counts, matching
replays, same-ID races, and concurrent refund. All synthetic records are
deleted. No production ticket, payments, migrations or provider
configurations are modified during testing.
