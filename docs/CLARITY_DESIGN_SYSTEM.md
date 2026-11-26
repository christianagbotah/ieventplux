# Clarity-first product design standard

Owner approved a clean, spacious and legible web/native visual direction on 2026-11-26. The reference is the illustrative design direction, not a verified clone of any third-party website. Preserve iEventPlux identity and all product workflows.

## Shared visual language

- White/light neutral surfaces, deep readable ink, consistent emerald brand accent. Dark web theme remains supported. Use imagery for discovery, not as a background for important dates, locations or prices.
- Web reading copy and ordinary fields: 16px with comfortable line height. Native is intentionally more compact: body 14sp/21sp line height, metadata 12sp, labels 13sp, action text 14sp, card headings 15–16sp, section headings 18–20sp and page headings 22–24sp. Reserve larger text for exceptional emphasis; respect system font scaling. Distinguish hierarchy through spacing and weight, not blanket enlargement.
- Primary buttons and fields: 48px/dp minimum, clear labels, focus state, disabled/busy state, sufficient room to wrap. Secondary compact controls must preserve touch accessibility.
- Cards: solid reading surfaces, balanced 16–20px web / 12–16dp native internal padding, moderate radii and subtle boundaries, restrained shadows, obvious primary action. Avoid decorative clutter and tiny uppercase labels.
- Navigation: visible text, selected state, keyboard focus, independent workspace scrolling; larger system font sizes may use two rows for native bottom tabs or vertically stacked action layouts.
- Forms and dialogs: explicit labels, inline error and guidance, readable descriptions, scrollable content, action confirmation. Native uses React Native controls and real server API, not web redirects except separately justified external services/documents.
- Keep meaningful motion optional; honor reduced-motion settings. Avoid text over busy imagery, fixed height clipping, and hiding important data behind truncation.

## First implementation slice

Shared web buttons, inputs, textareas, field guidance and native compact typography/dialogs; application bar, native tab bar and filters; responsive discovery grid, event metadata cards, native and web event details, native programme sections. Workspace navigation and table text improved without changing independent scroll behavior.

## Acceptance / next slices

1. CI browser at 320/390/768/1440 CSS pixels: real seeded discovery and detail routes, no document horizontal overflow, 16px search field, >=48px search control, >=18px card titles, >=28px event heading. Publish screenshots as CI artifacts. Check contrast, wrapping, keyboard focus, larger text and dark theme visually; screenshots are evidence, not automatic design approval.
2. Native Android/iOS: run typecheck and bundles; on physical device check system font scaling, 320/360/390+ widths, portrait/landscape, safe areas, navigation, dialogs, search, tickets, agenda and accessibility. Do not claim device verification from JS bundle tests.
3. Continue each organizer/admin workflow: dashboards, event creation, ticket management, attendance, meeting/live, marketplace, transport, payments, reports, moderation and settings. Audit tables for responsive containment rather than shrinking text. Retain actual role/entitlement behavior.
4. Review fresh QA APK and responsive staging with owner; record issues in private execution backlog. Design standard should guide other Lightworld projects, but apply via each project's own reviewed implementation rather than a blanket global CSS change.

Owner refinement: default native typography must feel balanced on ordinary phones, not like large-print mode. Keep a quiet single-row bottom bar at normal text scale, compact hero, fewer decorative labels, meaningful content above the fold, and comfortable tap targets independent of text size. Do not clone external sites. Native physical-device review is required before visual approval.
