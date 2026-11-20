# Provider configuration and delivery status

20 November 2026

Platform administrators can save encrypted Hubtel and SMTP credentials to the
database, without restarting the application. The prior environment-only
validation reported provider unavailable even when those credentials were saved.

The public health response and Admin Integrations panel now reconcile only
missing-environment warnings with the real resolved provider configuration
for Hubtel Checkout, Send Money, SMS, and SMTP. The unchanged provider detail
still distinguishes credential configuration from verified real delivery.

This change does not enable financial transactions, waive go-live gates, or
claim that provider acceptance equals delivered handset SMS or inbox mail.
Providers missing credentials and unrelated configuration warnings are preserved.

Tests: provider-health unit tests, TypeScript typecheck, lint, build and
post-deploy health verification. No database migration required.
