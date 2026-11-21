# iEventPlux — Enterprise UI foundation

## Design principle

An event-social, ticketing, organizer and media platform should feel like one product across public discovery, account access, organization onboarding, event detail, group meetings, organizer workspaces and administration. This release evolves the **existing evergreen brand** with calm surfaces, visible focus, readable text, consistent hierarchy, purposeful motion and strong input feedback. It does not introduce a different brand, customer-facing demo data, new paid services, or a second website.

## Shared component contract

| Component | UX behavior |
|---|---|
| `Button` | 44px default; 36px small on desktop (44px on coarse pointers); 48px large; consistent radius, 3px accessible focus ring, disabled/busy states, premium primary actions, soft and outline variants; `asChild` behavior preserved |
| `Input` | 44px target with a 16px mobile text size to avoid Safari autozoom, clear borders, hover/focus and invalid states, read-only styling, full width and native file input affordance |
| `Textarea` | Minimum 112px, text wrapping, manual vertical resize, clear focus/error indicators |
| `Select` | Consistent trigger width/height, accessible Radix focus, menu with padded 40px options and mobile-friendly touch selection; content can show multiple options instead of being constrained to trigger height |
| `Tabs` | Inset segmented surface, selected/keyboard states and horizontal scroll for narrow screens |
| `Dialog` | Safe viewport-bounded max height with internal scrolling and overscroll containment, theme-aware scrim and accessible close control |
| `Card` | Quiet 17px-like round surfaces, compact but legible header/body/footer rhythm, no misleading interactive hover on non-clickable cards |
| `Badge` | Compact rounded status metadata |
| `Field` | Reusable semantic field, label with `htmlFor`, help, and `role=alert` error text |
| `Skeleton` | Neutral placeholder with reduced-motion behavior |

## Sitewide layout

- Public site and mobile bottom navigation retain their existing routes, featured content and scrolling. The brand navigation has clear active states and aligned control sizes.
- Organizer and admin retain **independent** sidebar/content scrolling on desktop. No global changes to scroll ownership, current route, services, or onboarding backend.
- Mobile interaction controls have coarse-pointer 44px minimums. Focus states stay visible with keyboard; animations respect reduced-motion settings.
- Theme tokens inherit existing light/dark design. No external fonts or stock-image dependencies added.
- Application top bar and workspace cards use subtle borders, controlled elevation and stronger readable typography.

## Revised flows

- **Group Meetings**: professional branded context header, accessible event selector, accurate SFU no-fixed-participant-cap explanation, polished room status and create/open actions. Old 2–6-person warning removed (that applies only to retired P2P mode; deployed SFU has no fixed application cap).
- **Authentication**: primary sign-in and registration CTAs now use the same premium button and loading state as the organizer app. The existing password reset and safe invitation return route are preserved.
- **Organizer creation**: explicit profile → verification → publication stages, elevated selectable cards with `aria-pressed`, consistent name field, clear guidance and a strong async CTA.
- Existing free RSVP, paid ticket gates, event records, sign-in/auth and meeting permissions are not changed.

## QA gates and limitations

1. `bun test src/components/ui/ui-foundation.test.tsx` verifies markup contract, variant/size, loading/disabled semantics, accessibility attributes, labels and card regions. CI includes this test.
2. Run lint, TypeScript, GitHub web/mobile/production-build CI.
3. Validate page loading, keyboard access and horizontal overflow at 360/390/768/1440px, both themes, and dialog/selector behavior in a real browser. Do not claim complete manual cross-device certification from automated markup checks.
4. Cut over only the user-designated testing URL **https://ieventplux.lightworldtech.com** from an immutable verified release after isolated web/health tests. Keep previous web and real-time systemd configurations for rollback; do not touch payment or customer data.

## Next visual QA rounds

Bring event-creation wizard, ticket checkout, staff KYC, social post cards, notifications, AI Studio, media controls and admin tables onto these same foundations page by page. Validate dark-mode legibility, keyboard flows and smaller Android screens with real interactions before certifying world-class UI.
