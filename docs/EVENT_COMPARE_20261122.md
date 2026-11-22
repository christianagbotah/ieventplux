# iEventPlux: Global Event Compare and Share

Visitors can shortlist up to three public catalogue events and compare them
by schedule, location, format, price, inventory and organizer. Compare buttons
are available on public search and upcoming event cards. The touch-friendly
comparison dock works across mobile and desktop sizes.

Shared links use the local hash route /#/compare?ids=...; clean paths redirect
to it. GET /api/v1/discovery/compare strictly validates IDs and only returns
PUBLIC_EVENT_WHERE results. Nonpublic events never leak event data.

User selections save only public event IDs locally when permitted. The
comparison is mobile-scrollable with sticky row headings, removable picks and
share via native share or a copyable URL. Currency prices are kept in each
original denomination. No payment, database migration or new paid dependency.

QA: parser/link tests, mobile browser UAT, and live endpoint guards. Confirm
actual availability and prices before booking.

Future roadmap: authenticated collaborative shortlists, accessibility
preferences and event community networking. Not part of this release.
