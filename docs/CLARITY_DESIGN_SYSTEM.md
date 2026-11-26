# Clarity-first product design standard

Owner approved a clean, spacious and legible web/native visual direction on 2026-11-26. The reference is the illustrative design direction, not a verified clone of any third-party website. Preserve iEventPlux identity and all product workflows.

## Shared visual language

- White/light neutral surfaces, deep readable ink, consistent emerald brand accent. Dark web theme remains supported. Use imagery for discovery, not as a background for important dates, locations or prices.
- Reading copy and ordinary fields: 16px web / 16sp native, comfortable 24px/sp line height. Metadata and labels normally 14px/sp; compact labels only where they remain usable. Titles 24–32px/sp, event headings and card titles differentiated by weight and spacing.
- Primary buttons and fields: 48px/sp minimum, clear labels, focus state, disabled/busy state, sufficient room to wrap. Secondary compact controls must preserve touch accessibility.
- Cards: solid reading surfaces, balanced 16–20px/sp internal padding, moderate radii and subtle boundaries, restrained shadows, obvious primary action. Avoid decorative clutter and tiny uppercase labels.
- Navigation: visible text, selected state, keyboard focus, independent workspace scrolling; larger system font sizes may use two rows for native bottom tabs or vertically stacked action layouts.
- Forms and dialogs: explicit labels, inline error and guidance, readable descriptions, scrollable content, action confirmation. Native uses React Native controls and real server API, not web redirects except separately justified external services/documents.
- Keep meaningful motion optional; honor reduced-motion settings. Avoid text over busy imagery, fixed height clipping, and hiding important data behind truncation.

## First implementation slice

Shared web buttons, inputs, textareas, field guidance and native premium typography/dialogs; application bar, native tab bar and filters; responsive discovery grid, event metadata cards, native and web event details, native programme sections. Workspace navigation and table text improved without changing independent scroll behavior.

## Acceptance / next slices

1. CI browser at 320/390/768/1440 CSS pixels: real seeded discovery and detail routes, no document horizontal overflow, 16px search field, >=48px search control, >=18px card titles, >=28px event heading. Publish screenshots as CI artifacts. Check contrast, wrapping, keyboard focus, larger text and dark theme visually; screenshots are evidence, not automatic design approval.
2. Native Android/iOS: run typecheck and bundles; on physical device check system font scaling, 320/360/390+ widths, portrait/landscape, safe areas, navigation, dialogs, search, tickets, agenda and accessibility. Do not claim device verification from JS bundle tests.
3. Continue each organizer/admin workflow: dashboards, event creation, ticket management, attendance, meeting/live, marketplace, transport, payments, reports, moderation and settings. Audit tables for responsive containment rather than shrinking text. Retain actual role/entitlement behavior.
4. Review fresh QA APK and responsive staging with owner; record issues in private execution backlog. Design standard should guide other Lightworld projects, but apply via each project's own reviewed implementation rather than a blanket global CSS change.
