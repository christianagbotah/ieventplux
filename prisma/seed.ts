/**
 * iEventPlux deterministic development seed.
 * Synthetic identities + synthetic media only. Development credentials are
 * DEV-ONLY and must never be used in production initialization.
 * Run: bun run db:seed
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/server/auth'
import { createOrder } from '../src/server/services/ordering'
import { fulfilFreeOrder, fulfilPaidOrder } from '../src/server/services/fulfilment'
import { ensureOrgAccounts, ensurePlatformAccounts, postJournal } from '../src/server/ledger'
import { paymentReference } from '../src/server/ids'
import { cssEffects } from '../src/data/css-effects'

const DEV_PASSWORD = 'Dev@12345'
const TZ = 'Africa/Accra'

function daysFromNow(days: number, hour = 17, minute = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d
}

async function main() {
  console.log('🌱 Seeding iEventPlux development data…')
  const passwordHash = await hashPassword(DEV_PASSWORD)

  // ── Users ───────────────────────────────────────────────────────────────
  const users = {
    admin: await db.user.create({ data: { email: 'admin@ieventplux.dev', passwordHash, displayName: 'Kwabena Mensah', role: 'SUPER_ADMIN', phone: '+233240000001', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    financeAdmin: await db.user.create({ data: { email: 'finance@ieventplux.dev', passwordHash, displayName: 'Akosua Boateng', role: 'FINANCE_ADMIN', phone: '+233240000002', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    moderator: await db.user.create({ data: { email: 'moderator@ieventplux.dev', passwordHash, displayName: 'Yao Adzika', role: 'MODERATOR', emailVerifiedAt: new Date(), city: 'Ho', timezone: TZ } }),
    support: await db.user.create({ data: { email: 'support@ieventplux.dev', passwordHash, displayName: 'Efua Sarpong', role: 'SUPPORT', emailVerifiedAt: new Date(), city: 'Kumasi', timezone: TZ } }),
    pastor: await db.user.create({ data: { email: 'pastor@lightworld.dev', passwordHash, displayName: 'Pastor Samuel Adjei', phone: '+233240000003', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    mediaLead: await db.user.create({ data: { email: 'media@lightworld.dev', passwordHash, displayName: 'Grace Nkrumah', phone: '+233240000004', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    orgFinance: await db.user.create({ data: { email: 'finance@lightworld.dev', passwordHash, displayName: 'Daniel Osei', phone: '+233240000005', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    usher: await db.user.create({ data: { email: 'usher@lightworld.dev', passwordHash, displayName: 'Abena Asante', phone: '+233240000006', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    director: await db.user.create({ data: { email: 'director@lwministries.dev', passwordHash, displayName: 'Elder Joseph Tetteh', phone: '+233240000007', emailVerifiedAt: new Date(), city: 'Tema', timezone: TZ } }),
    techLead: await db.user.create({ data: { email: 'ghana@techassoc.dev', passwordHash, displayName: 'Nana Kwesi Ampofo', phone: '+233240000008', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    eventCoOwner: await db.user.create({ data: { email: 'accra@eventco.dev', passwordHash, displayName: 'Maame Yaa Forson', phone: '+233240000009', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
    ama: await db.user.create({ data: { email: 'ama@example.dev', passwordHash, displayName: 'Ama Darko', phone: '+233240000010', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ, notifPrefs: '{"email":true,"sms":true,"push":true,"marketing":true}' } }),
    kojo: await db.user.create({ data: { email: 'kojo@example.dev', passwordHash, displayName: 'Kojo Owusu', phone: '+233240000011', emailVerifiedAt: new Date(), city: 'Takoradi', timezone: TZ, notifPrefs: '{"email":true,"sms":false,"push":true,"marketing":false}' } }),
    akua: await db.user.create({ data: { email: 'akua@example.dev', passwordHash, displayName: 'Akua Frimpong', phone: '+233240000012', emailVerifiedAt: new Date(), city: 'Accra', timezone: TZ } }),
  }

  // ── Platform config ─────────────────────────────────────────────────────
  await db.feeVersion.create({ data: { version: 1, name: 'Launch fees', ticketCommissionPct: 500, processingFeePct: 195, smsRateMinor: 5, createdBy: users.admin.id } })
  await db.category.createMany({
    data: [
      { name: 'Church Service', slug: 'church-service', icon: 'church', color: '#10b981', sortOrder: 1 },
      { name: 'Concert', slug: 'concert', icon: 'music', color: '#f59e0b', sortOrder: 2 },
      { name: 'Conference', slug: 'conference', icon: 'presentation', color: '#0d9488', sortOrder: 3 },
      { name: 'Workshop', slug: 'workshop', icon: 'wrench', color: '#f43f5e', sortOrder: 4 },
      { name: 'Bootcamp', slug: 'bootcamp', icon: 'code', color: '#7c3aed', sortOrder: 5 },
      { name: 'Wedding', slug: 'wedding', icon: 'heart', color: '#ec4899', sortOrder: 6 },
      { name: 'Community', slug: 'community', icon: 'users', color: '#84cc16', sortOrder: 7 },
      { name: 'Ministry', slug: 'ministry', icon: 'sparkles', color: '#d97706', sortOrder: 8 },
      { name: 'Festival', slug: 'festival', icon: 'party-popper', color: '#ef4444', sortOrder: 9 },
      { name: 'Sports & Health', slug: 'sports-health', icon: 'activity', color: '#14b8a6', sortOrder: 10 },
    ],
  })
  await db.subscriptionPlan.createMany({
    data: [
      {
        code: 'BASIC', name: 'Basic', description: 'Get started with ticketed events.', priceMinor: 0, billingPeriodDays: 30, sortOrder: 1,
        entitlements: JSON.stringify({ maxPublishedEvents: 3, teamSeats: 2, analytics: false, smsPerMonth: 100, streamMinutesPerMonth: 60, replaysIncluded: false }),
      },
      {
        code: 'PRO', name: 'Organizer Pro', description: 'For growing ministries and event teams.', priceMinor: 14900, billingPeriodDays: 30, sortOrder: 2,
        entitlements: JSON.stringify({ maxPublishedEvents: 25, teamSeats: 8, analytics: true, smsPerMonth: 1000, streamMinutesPerMonth: 600, replaysIncluded: true }),
      },
      {
        code: 'ORG', name: 'Organization', description: 'Large organizations with multiple teams.', priceMinor: 39900, billingPeriodDays: 30, sortOrder: 3,
        entitlements: JSON.stringify({ maxPublishedEvents: 200, teamSeats: 30, analytics: true, smsPerMonth: 5000, streamMinutesPerMonth: 3000, replaysIncluded: true }),
      },
    ],
  })
  await ensurePlatformAccounts()

  // ── Organizations ───────────────────────────────────────────────────────
  const chapel = await db.organization.create({
    data: {
      name: 'Lightworld Chapel International', slug: 'lightworld-chapel', orgType: 'CHURCH',
      tagline: 'Raising a generation of light.', description: 'A Christ-centred congregation in Accra serving the city through worship, word and community outreach.',
      logoUrl: null, coverUrl: '/images/posters/prayer-night.png', country: 'GH', city: 'Accra', address: '12 Liberation Road, Accra',
      contactEmail: 'hello@lightworld.dev', contactPhone: '+233240000003', website: 'https://lightworld.example',
      ownerId: users.pastor.id, status: 'ACTIVE', verifiedAt: new Date(), smsQuotaPerMonth: 1000, streamMinutesAllowance: 600,
    },
  })
  await db.organizerVerification.create({ data: { orgId: chapel.id, status: 'APPROVED', reviewerId: users.admin.id, decidedAt: new Date(), notes: 'Registration + bank details verified (synthetic).', evidence: JSON.stringify([{ type: 'registration', ref: 'DEV-SYNTH-001' }]) } })
  await db.membership.createMany({ data: [
    { orgId: chapel.id, userId: users.pastor.id, role: 'OWNER', acceptedAt: new Date() },
    { orgId: chapel.id, userId: users.mediaLead.id, role: 'EVENT_MANAGER', acceptedAt: new Date() },
    { orgId: chapel.id, userId: users.orgFinance.id, role: 'FINANCE', acceptedAt: new Date() },
    { orgId: chapel.id, userId: users.usher.id, role: 'CHECKIN_STAFF', acceptedAt: new Date() },
  ] })

  const ministries = await db.organization.create({
    data: {
      name: 'Lightworld Ministries', slug: 'lightworld-ministries', orgType: 'MINISTRY',
      tagline: 'Equipping leaders, serving communities.', description: 'Leadership training, community outreach and mentoring programmes across Ghana.',
      country: 'GH', city: 'Tema', contactEmail: 'info@lwministries.dev', contactPhone: '+233240000007',
      ownerId: users.director.id, status: 'ACTIVE', verifiedAt: new Date(), smsQuotaPerMonth: 500,
    },
  })
  await db.organizerVerification.create({ data: { orgId: ministries.id, status: 'APPROVED', reviewerId: users.admin.id, decidedAt: new Date(), notes: 'Verified (synthetic).' } })
  await db.membership.createMany({ data: [
    { orgId: ministries.id, userId: users.director.id, role: 'OWNER', acceptedAt: new Date() },
    { orgId: ministries.id, userId: users.mediaLead.id, role: 'EVENT_MANAGER', acceptedAt: new Date() },
  ] })

  const techAssoc = await db.organization.create({
    data: {
      name: 'Ghana Tech Association', slug: 'ghana-tech-association', orgType: 'ASSOCIATION',
      tagline: 'Ghana\'s community of builders.', description: 'Workshops, bootcamps and meetups for Ghanaian developers and founders.',
      country: 'GH', city: 'Accra', contactEmail: 'hello@techassoc.dev', contactPhone: '+233240000008',
      ownerId: users.techLead.id, status: 'ACTIVE', verifiedAt: new Date(), smsQuotaPerMonth: 300,
    },
  })
  await db.organizerVerification.create({ data: { orgId: techAssoc.id, status: 'APPROVED', reviewerId: users.admin.id, decidedAt: new Date(), notes: 'Verified (synthetic).' } })
  await db.membership.create({ data: { orgId: techAssoc.id, userId: users.techLead.id, role: 'OWNER', acceptedAt: new Date() } })

  const eventCo = await db.organization.create({
    data: {
      name: 'Accra Events & Co.', slug: 'accra-events-co', orgType: 'COMPANY',
      tagline: 'Unforgettable Accra experiences.', description: 'Premium festivals, expos and lifestyle events in the capital.',
      country: 'GH', city: 'Accra', contactEmail: 'bookings@eventco.dev', contactPhone: '+233240000009',
      ownerId: users.eventCoOwner.id, status: 'PENDING_VERIFICATION', // demonstrates the verification workflow
    },
  })
  await db.organizerVerification.create({ data: { orgId: eventCo.id, status: 'PENDING', notes: 'Awaiting business registration documents.' } })
  await db.membership.create({ data: { orgId: eventCo.id, userId: users.eventCoOwner.id, role: 'OWNER', acceptedAt: new Date() } })

  await ensureOrgAccounts(chapel.id)
  await ensureOrgAccounts(ministries.id)
  await ensureOrgAccounts(techAssoc.id)
  await ensureOrgAccounts(eventCo.id)

  const proPlan = await db.subscriptionPlan.findUnique({ where: { code: 'PRO' } })
  const orgPlan = await db.subscriptionPlan.findUnique({ where: { code: 'ORG' } })
  if (proPlan) {
    await db.subscription.create({ data: { orgId: chapel.id, planId: proPlan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 18 * 86400000) } })
    await db.subscription.create({ data: { orgId: ministries.id, planId: proPlan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 25 * 86400000) } })
  }
  if (orgPlan) {
    await db.subscription.create({ data: { orgId: techAssoc.id, planId: orgPlan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 12 * 86400000) } })
  }

  // ── Venues ──────────────────────────────────────────────────────────────
  const cathedral = await db.venue.create({ data: { orgId: chapel.id, name: 'Lightworld Cathedral', address: '12 Liberation Road', city: 'Accra', region: 'Greater Accra', country: 'GH', lat: 5.6037, lng: -0.187, capacity: 3000, mapsUrl: 'https://maps.google.com/?q=Accra', accessibilityInfo: 'Wheelchair ramps at main entrance; reserved seating available.' } })
  const laboma = await db.venue.create({ data: { orgId: eventCo.id, name: 'Laboma Beach Resort', address: 'Laboma Beach, La-Accra', city: 'Accra', country: 'GH', lat: 5.5637, lng: -0.157, capacity: 5000, mapsUrl: 'https://maps.google.com/?q=Laboma+Beach' } })
  const aicc = await db.venue.create({ data: { orgId: ministries.id, name: 'Accra International Conference Centre', address: 'Liberation Link, Ridge', city: 'Accra', country: 'GH', lat: 5.5717, lng: -0.19, capacity: 1600, mapsUrl: 'https://maps.google.com/?q=AICC+Accra' } })
  const techHub = await db.venue.create({ data: { orgId: techAssoc.id, name: 'Tech Hub Accra', address: 'Otu Ave, Cantonments', city: 'Accra', country: 'GH', capacity: 200, mapsUrl: 'https://maps.google.com/?q=Cantonments+Accra' } })

  // ── Recurring series ────────────────────────────────────────────────────
  const series = await db.eventSeries.create({
    data: { orgId: chapel.id, title: 'Sunday Celebration Service', slug: 'sunday-celebration-service', description: 'Weekly celebration service with worship, word and communion.', categorySlug: 'church-service', timezone: TZ, recurrence: JSON.stringify({ freq: 'WEEKLY', byWeekDay: [0], time: '09:00', durationMin: 120 }), visibility: 'PUBLIC' },
  })

  // ── Events ──────────────────────────────────────────────────────────────
  const gospelNight = await db.event.create({ data: { orgId: chapel.id, title: 'Accra Gospel Night of Wonders', slug: 'accra-gospel-night-of-wonders', summary: 'An unforgettable night of worship with leading Ghanaian gospel artists.', description: 'Join thousands for a power-packed evening of live worship, ministration and testimonies featuring top gospel acts from across Ghana. Gates open at 4pm. Come expecting a miracle!', categorySlug: 'concert', tags: JSON.stringify(['gospel', 'worship', 'live', 'family']), coverImageUrl: '/images/posters/gospel-concert.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: cathedral.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(8, 17), endsAt: daysFromNow(8, 21), publishedAt: new Date(), contactEmail: 'events@lightworld.dev', contactPhone: '+233240000003', accessibilityInfo: 'Accessible seating and ushers for mobility support.', attendanceRules: 'Children under 12 free with an adult. No professional cameras.', directionsUrl: 'https://maps.google.com/?q=Accra', createdBy: users.mediaLead.id, isFeatured: true } })
  const summit = await db.event.create({ data: { orgId: ministries.id, title: 'Ministry Leaders Summit 2026', slug: 'ministry-leaders-summit-2026', summary: 'Equipping church and ministry leaders for greater impact.', description: 'A two-day hybrid summit for pastors, ministry leads and administrators. Tracks on leadership, stewardship, media and technology. In-person includes lunch; virtual includes live sessions and materials.', categorySlug: 'conference', tags: JSON.stringify(['leadership', 'training', 'hybrid']), coverImageUrl: '/images/posters/church-conference.png', mode: 'HYBRID', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: aicc.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(21, 9), endsAt: daysFromNow(22, 16), publishedAt: new Date(), createdBy: users.director.id, isFeatured: true } })
  const vigil = await db.event.create({ data: { orgId: chapel.id, title: 'All-Night Prayer Vigil — December Edition', slug: 'all-night-prayer-vigil-december', summary: 'Crossing into the new month with prayer and worship.', description: 'An all-night vigil of intercession for the nation and families. Free admission with RSVP. Candles provided.', categorySlug: 'ministry', tags: JSON.stringify(['prayer', 'night', 'free']), coverImageUrl: '/images/posters/prayer-night.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: cathedral.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(5, 22), endsAt: daysFromNow(6, 4), publishedAt: new Date(), createdBy: users.pastor.id } })
  const weddingExpo = await db.event.create({ data: { orgId: eventCo.id, title: 'Luxury Wedding & Bridal Expo', slug: 'luxury-wedding-bridal-expo', summary: 'Ghana\'s most elegant wedding showcase.', description: 'Meet top wedding vendors, designers and planners under one roof. Runway shows every hour.', categorySlug: 'wedding', tags: JSON.stringify(['wedding', 'expo', 'luxury']), coverImageUrl: '/images/posters/wedding-expo.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: laboma.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(14, 10), endsAt: daysFromNow(14, 18), publishedAt: new Date(), createdBy: users.eventCoOwner.id } })
  const bootcamp = await db.event.create({ data: { orgId: techAssoc.id, title: 'Full-Stack Web Development Bootcamp', slug: 'full-stack-web-dev-bootcamp', summary: '8 weeks from zero to deployable apps.', description: 'Intensive evening classes covering TypeScript, React, Node.js and deployment. Certificate on completion.', categorySlug: 'bootcamp', tags: JSON.stringify(['tech', 'coding', 'career']), coverImageUrl: '/images/posters/tech-bootcamp.png', mode: 'VIRTUAL', visibility: 'PUBLIC', status: 'PUBLISHED', country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(10, 18), endsAt: daysFromNow(66, 21), publishedAt: new Date(), createdBy: users.techLead.id, isFeatured: true } })
  const businessSummit = await db.event.create({ data: { orgId: ministries.id, title: 'SME Growth & Trade Summit', slug: 'sme-growth-trade-summit', summary: 'Practical growth playbooks for Ghanaian SMEs.', description: 'Sessions on financing, exports, digital tools and compliance. Network with lenders and partners.', categorySlug: 'conference', tags: JSON.stringify(['business', 'sme', 'networking']), coverImageUrl: '/images/posters/business-summit.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: aicc.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(16, 9), endsAt: daysFromNow(16, 17), publishedAt: new Date(), createdBy: users.director.id } })
  const artsWorkshop = await db.event.create({ data: { orgId: ministries.id, title: 'Youth Creative Arts Workshop', slug: 'youth-creative-arts-workshop', summary: 'Free hands-on arts weekend for ages 13–19.', description: 'Painting, crafts and storytelling sessions led by professional artists. All materials provided free.', categorySlug: 'workshop', tags: JSON.stringify(['youth', 'arts', 'free']), coverImageUrl: '/images/posters/youth-workshop.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', country: 'GH', city: 'Tema', timezone: TZ, startsAt: daysFromNow(7, 10), endsAt: daysFromNow(7, 15), publishedAt: new Date(), createdBy: users.director.id, ageGuidance: 'Ages 13–19' } })
  const foodFestival = await db.event.create({ data: { orgId: eventCo.id, title: 'Accra Street Food Festival', slug: 'accra-street-food-festival', summary: 'Taste the city: 100+ vendors, live bands.', description: 'Jollof wars, kelewele alley, live highlife bands and a kids zone. Tickets at the gate cost more — buy early!', categorySlug: 'festival', tags: JSON.stringify(['food', 'family', 'festival']), coverImageUrl: '/images/posters/food-festival.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: laboma.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(12, 11), endsAt: daysFromNow(12, 23), publishedAt: new Date(), createdBy: users.eventCoOwner.id } })
  const healthWalk = await db.event.create({ data: { orgId: eventCo.id, title: 'City Health Walk & Mini Marathon', slug: 'city-health-walk-marathon', summary: '10km walk, 5km fun run — free entry.', description: 'A free community health movement. Free t-shirts for the first 500 registrants.', categorySlug: 'sports-health', tags: JSON.stringify(['fitness', 'community', 'free']), coverImageUrl: '/images/posters/health-walk.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(18, 6), endsAt: daysFromNow(18, 11), publishedAt: new Date(), createdBy: users.eventCoOwner.id } })
  const carols = await db.event.create({ data: { orgId: chapel.id, title: 'Carols by Candlelight Night', slug: 'carols-by-candlelight', summary: 'The beloved annual candlelight carols service.', description: 'Nine lessons and carols with the mass choir, orchestra and guest minstrels. Hot chocolate after service.', categorySlug: 'concert', tags: JSON.stringify(['christmas', 'carols', 'family']), coverImageUrl: '/images/posters/carols-night.png', mode: 'HYBRID', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: cathedral.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(35, 19), endsAt: daysFromNow(35, 21), publishedAt: new Date(), createdBy: users.mediaLead.id } })
  const easterPast = await db.event.create({ data: { orgId: chapel.id, title: 'Easter Passion Live 2026', slug: 'easter-passion-live-2026', summary: 'A dramatic musical journey through the passion of Christ.', description: 'A full stage production with 200 cast members. Thank you to everyone who joined us!', categorySlug: 'concert', tags: JSON.stringify(['easter', 'production']), coverImageUrl: '/images/posters/prayer-night.png', mode: 'HYBRID', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: cathedral.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(-60, 18), endsAt: daysFromNow(-60, 21), publishedAt: daysFromNow(-90), createdBy: users.mediaLead.id } })
  const unlistedRetreat = await db.event.create({ data: { orgId: techAssoc.id, title: 'Board Strategy Retreat', slug: 'board-strategy-retreat', summary: 'Private board planning session.', description: 'Closed-door strategy session for association board members only.', categorySlug: 'conference', tags: JSON.stringify(['strategy']), coverImageUrl: '/images/posters/business-summit.png', mode: 'PHYSICAL', visibility: 'UNLISTED', status: 'PUBLISHED', venueId: techHub.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(9, 9), endsAt: daysFromNow(9, 16), publishedAt: new Date(), createdBy: users.techLead.id } })
  const donorsDinner = await db.event.create({ data: { orgId: ministries.id, title: 'Private Donors\' Appreciation Dinner', slug: 'private-donors-appreciation-dinner', summary: 'An invitation-only evening honouring our partners.', description: 'By invitation only. Kindly RSVP with your invitation code.', categorySlug: 'community', tags: JSON.stringify(['donors', 'private']), coverImageUrl: '/images/posters/wedding-expo.png', mode: 'PHYSICAL', visibility: 'INVITE_ONLY', status: 'PUBLISHED', venueId: aicc.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: daysFromNow(6, 18), endsAt: daysFromNow(6, 22), publishedAt: new Date(), createdBy: users.director.id } })
  const worshipLive = await db.event.create({ data: { orgId: chapel.id, title: 'Worship Without Limits — Live Stream', slug: 'worship-without-limits-live', summary: ' LIVE NOW: spontaneous worship night streaming worldwide.', description: 'Join the spontaneous worship atmosphere from the Upper Room Auditorium. Free live stream; replay available for ticket holders of the Gospel Night.', categorySlug: 'ministry', tags: JSON.stringify(['live', 'worship', 'stream']), coverImageUrl: '/images/posters/gospel-concert.png', mode: 'VIRTUAL', visibility: 'PUBLIC', status: 'LIVE', country: 'GH', city: 'Accra', timezone: TZ, startsAt: new Date(Date.now() - 45 * 60000), endsAt: new Date(Date.now() + 105 * 60000), publishedAt: new Date(), createdBy: users.mediaLead.id } })
  const masterclass = await db.event.create({ data: { orgId: ministries.id, title: 'Paid Masterclass: Event Financing 101', slug: 'masterclass-event-financing-101', summary: 'LIVE paid masterclass on financing events and settling payouts.', description: 'A 90-minute live masterclass for event organizers covering collections, fees, refunds and payout discipline. Includes replay access for 30 days.', categorySlug: 'workshop', tags: JSON.stringify(['finance', 'masterclass', 'live']), coverImageUrl: '/images/posters/business-summit.png', mode: 'VIRTUAL', visibility: 'PUBLIC', status: 'LIVE', country: 'GH', city: 'Accra', timezone: TZ, startsAt: new Date(Date.now() - 10 * 60000), endsAt: new Date(Date.now() + 80 * 60000), publishedAt: new Date(), createdBy: users.director.id } })

  // Sunday series occurrences (4)
  const sundayEvents: { id: string; startsAt: Date }[] = []
  for (let i = 0; i < 4; i++) {
    const next = new Date()
    const daysToSunday = (7 - next.getDay()) % 7 || 7
    next.setDate(next.getDate() + daysToSunday + i * 7)
    next.setHours(9, 0, 0, 0)
    const ends = new Date(next.getTime() + 2 * 3600000)
    const occ = await db.event.create({
      data: {
        orgId: chapel.id, seriesId: series.id, title: 'Sunday Celebration Service', slug: `sunday-celebration-service-${occurrenceSlug(next)}`,
        summary: 'Weekly celebration service with worship, word and communion.', description: 'Join us every Sunday at 9am for worship, the word and communion. Free RSVP helps us plan seating.',
        categorySlug: 'church-service', tags: JSON.stringify(['church', 'weekly', 'free']), coverImageUrl: '/images/posters/prayer-night.png', mode: 'PHYSICAL', visibility: 'PUBLIC', status: 'PUBLISHED', venueId: cathedral.id, country: 'GH', city: 'Accra', timezone: TZ, startsAt: next, endsAt: ends, publishedAt: new Date(), createdBy: users.pastor.id,
      },
    })
    sundayEvents.push({ id: occ.id, startsAt: next })
    await db.ticketType.create({ data: { eventId: occ.id, orgId: chapel.id, name: 'Open Seating (Free RSVP)', description: 'Free admission with RSVP.', kind: 'PHYSICAL', priceMinor: 0, quota: 800, perBuyerLimit: 5 } })
  }

  // ── Ticket types ────────────────────────────────────────────────────────
  const vip = await db.ticketType.create({ data: { eventId: gospelNight.id, orgId: chapel.id, name: 'VIP Front Block', description: 'Premium seating with reserved parking and express entry.', kind: 'PHYSICAL', priceMinor: 20000, quota: 100, perBuyerLimit: 4, includesVirtualAccess: true, saleEndsAt: daysFromNow(7) } })
  const regular = await db.ticketType.create({ data: { eventId: gospelNight.id, orgId: chapel.id, name: 'Regular', description: 'Open field seating. Gates open 4pm.', kind: 'PHYSICAL', priceMinor: 8000, quota: 2000, perBuyerLimit: 6, saleEndsAt: daysFromNow(7), groupMinQty: 5, groupPctOff: 10 } })
  await db.ticketType.create({ data: { eventId: gospelNight.id, orgId: chapel.id, name: 'Virtual Live Pass', description: 'Watch the live stream from anywhere.', kind: 'VIRTUAL', priceMinor: 3000, quota: 5000, perBuyerLimit: 2 } })
  await db.discountCode.create({ data: { eventId: gospelNight.id, code: 'GOSPEL10', pctOff: 10, maxUses: 200 } })

  await db.ticketType.create({ data: { eventId: summit.id, orgId: ministries.id, name: 'In-person (2 days)', description: 'Full access both days incl. lunch and materials.', kind: 'PHYSICAL', priceMinor: 35000, quota: 400, perBuyerLimit: 4 } })
  const summitVirtual = await db.ticketType.create({ data: { eventId: summit.id, orgId: ministries.id, name: 'Virtual Access', description: 'Live sessions + digital materials.', kind: 'VIRTUAL', priceMinor: 12000, quota: 2000, perBuyerLimit: 2, includesVirtualAccess: true } })

  await db.ticketType.create({ data: { eventId: vigil.id, orgId: chapel.id, name: 'Free RSVP', description: 'Free admission — RSVP to reserve your seat.', kind: 'PHYSICAL', priceMinor: 0, quota: 1500, perBuyerLimit: 4 } })
  await db.ticketType.create({ data: { eventId: weddingExpo.id, orgId: eventCo.id, name: 'General Entry', description: 'One-day entry to all showcase areas.', kind: 'PHYSICAL', priceMinor: 15000, quota: 1200, perBuyerLimit: 6 } })
  await db.ticketType.create({ data: { eventId: bootcamp.id, orgId: techAssoc.id, name: 'Cohort Tuition', description: 'Full 8-week cohort with certificate.', kind: 'VIRTUAL', priceMinor: 90000, quota: 60, perBuyerLimit: 1 } })
  await db.ticketType.create({ data: { eventId: businessSummit.id, orgId: ministries.id, name: 'Standard', description: 'Full-day access.', kind: 'PHYSICAL', priceMinor: 25000, quota: 600, perBuyerLimit: 5 } })
  await db.ticketType.create({ data: { eventId: artsWorkshop.id, orgId: ministries.id, name: 'Free Registration', description: 'All materials provided.', kind: 'PHYSICAL', priceMinor: 0, quota: 120, perBuyerLimit: 2 } })
  await db.ticketType.create({ data: { eventId: foodFestival.id, orgId: eventCo.id, name: 'Early Bird', description: 'Single-day entry before 2pm.', kind: 'PHYSICAL', priceMinor: 4000, quota: 3000, perBuyerLimit: 8 } })
  await db.ticketType.create({ data: { eventId: healthWalk.id, orgId: eventCo.id, name: 'Free Registration', description: 'Free entry — t-shirt for first 500.', kind: 'PHYSICAL', priceMinor: 0, quota: 2000, perBuyerLimit: 4 } })
  await db.ticketType.create({ data: { eventId: carols.id, orgId: chapel.id, name: 'Candlelight Seat', description: 'Reserved candlelight seating.', kind: 'PHYSICAL', priceMinor: 6000, quota: 1200, perBuyerLimit: 6 } })
  await db.ticketType.create({ data: { eventId: carols.id, orgId: chapel.id, name: 'Carols Live Stream', description: 'Watch from home with the full choir mix.', kind: 'VIRTUAL', priceMinor: 2000, quota: 3000, perBuyerLimit: 2 } })
  await db.ticketType.create({ data: { eventId: worshipLive.id, orgId: chapel.id, name: 'Free Live Stream', description: 'Free access to the live worship stream.', kind: 'VIRTUAL', priceMinor: 0, quota: 10000, perBuyerLimit: 1 } })

  // ── Live broadcasts ─────────────────────────────────────────────────────
  await db.liveBroadcast.create({ data: { eventId: worshipLive.id, title: 'Worship Without Limits — Main Stage', description: 'Live from the Upper Room Auditorium.', accessPolicy: 'FREE', status: 'LIVE', startedAt: new Date(Date.now() - 45 * 60000), viewerCapacity: 2000, createdById: users.mediaLead.id } })
  const masterclassBroadcast = await db.liveBroadcast.create({ data: { eventId: masterclass.id, title: 'Event Financing 101 — Live Masterclass', description: 'Live + 30-day replay included.', accessPolicy: 'PAID', priceMinor: 5000, status: 'LIVE', startedAt: new Date(Date.now() - 10 * 60000), viewerCapacity: 500, createdById: users.director.id } })
  await db.liveBroadcast.create({ data: { eventId: easterPast.id, title: 'Easter Passion Live — Replay', description: 'Full recording of the 2026 production.', accessPolicy: 'TICKET_HOLDERS', status: 'ENDED', startedAt: daysFromNow(-60, 18), endedAt: daysFromNow(-60, 21), recordingStatus: 'AVAILABLE', replayPriceMinor: 2000, createdById: users.mediaLead.id } })

  // ── Live engagement: open poll + closed poll + audience Q&A on the live events ──
  const worshipPoll = await db.livePoll.create({
    data: {
      eventId: worshipLive.id, question: 'Which worship flow should the team lead next?', status: 'OPEN', createdBy: users.mediaLead.id,
      openedAt: new Date(Date.now() - 20 * 60000),
      options: { create: [
        { text: 'Spontaneous free worship', position: 0 },
        { text: 'Classic hymns medley', position: 1 },
        { text: 'Gospel Night preview set', position: 2 },
        { text: 'Soaking / instrumental', position: 3 },
      ] },
    },
    include: { options: true },
  })
  await db.livePollVote.createMany({ data: [
    { pollId: worshipPoll.id, optionId: worshipPoll.options[0].id, userId: users.ama.id },
    { pollId: worshipPoll.id, optionId: worshipPoll.options[0].id, userId: users.kojo.id },
    { pollId: worshipPoll.id, optionId: worshipPoll.options[0].id, userId: users.akua.id },
    { pollId: worshipPoll.id, optionId: worshipPoll.options[1].id, userId: users.pastor.id },
    { pollId: worshipPoll.id, optionId: worshipPoll.options[2].id, userId: users.usher.id },
  ] })
  const worshipPoll2 = await db.livePoll.create({
    data: {
      eventId: worshipLive.id, question: 'Replay edit style for tomorrow?', status: 'CLOSED', createdBy: users.mediaLead.id,
      openedAt: new Date(Date.now() - 40 * 60000), closedAt: new Date(Date.now() - 12 * 60000),
      options: { create: [
        { text: 'Full uncut stream', position: 0 },
        { text: 'Highlights reel first', position: 1 },
      ] },
    },
    include: { options: true },
  })
  await db.livePollVote.createMany({ data: [
    { pollId: worshipPoll2.id, optionId: worshipPoll2.options[1].id, userId: users.ama.id },
    { pollId: worshipPoll2.id, optionId: worshipPoll2.options[1].id, userId: users.kojo.id },
    { pollId: worshipPoll2.id, optionId: worshipPoll2.options[0].id, userId: users.akua.id },
  ] })
  const mcPoll = await db.livePoll.create({
    data: {
      eventId: masterclass.id, question: 'Which financing topic should we go deepest on?', status: 'OPEN', createdBy: users.director.id,
      openedAt: new Date(Date.now() - 6 * 60000),
      options: { create: [
        { text: 'Sponsorship deal structures', position: 0 },
        { text: 'Refund reserves & float', position: 1 },
        { text: 'Payout reconciliation', position: 2 },
      ] },
    },
    include: { options: true },
  })
  await db.livePollVote.createMany({ data: [
    { pollId: mcPoll.id, optionId: mcPoll.options[0].id, userId: users.techLead.id },
    { pollId: mcPoll.id, optionId: mcPoll.options[1].id, userId: users.eventCoOwner.id },
    { pollId: mcPoll.id, optionId: mcPoll.options[1].id, userId: users.ama.id },
  ] })
  const q1 = await db.audienceQuestion.create({ data: { eventId: worshipLive.id, userId: users.ama.id, body: 'Will the replay include the testimony segment too?', pinned: true, createdAt: new Date(Date.now() - 30 * 60000) } })
  await db.audienceQuestion.create({ data: { eventId: worshipLive.id, userId: users.kojo.id, body: 'Can we request a specific hymn during the free worship flow?', createdAt: new Date(Date.now() - 18 * 60000) } })
  await db.audienceQuestion.create({ data: { eventId: worshipLive.id, userId: users.akua.id, body: 'Is the Upper Room Auditorium open for in-person attendance tonight?', createdAt: new Date(Date.now() - 9 * 60000) } })
  await db.audienceQuestion.create({ data: { eventId: worshipLive.id, userId: users.ama.id, body: 'Please confirm the stream will stay free for the whole night?', status: 'ANSWERED', answer: 'Yes — the stream is free all night, and Gospel Night ticket holders also unlock the replay.', answeredById: users.mediaLead.id, answeredAt: new Date(Date.now() - 4 * 60000), createdAt: new Date(Date.now() - 25 * 60000) } })
  await db.audienceQuestionUpvote.createMany({ data: [
    { questionId: q1.id, userId: users.kojo.id },
    { questionId: q1.id, userId: users.akua.id },
    { questionId: q1.id, userId: users.usher.id },
  ] })


  // ── Media (posters as gallery + synthetic clips for reels) ──────────────
  await db.mediaAsset.createMany({ data: [
    { orgId: chapel.id, eventId: gospelNight.id, uploaderId: users.mediaLead.id, kind: 'GALLERY', url: '/images/posters/gospel-concert.png', caption: 'Main stage setup' },
    { orgId: chapel.id, eventId: gospelNight.id, uploaderId: users.mediaLead.id, kind: 'GALLERY', url: '/images/posters/carols-night.png', caption: 'Choir rehearsal' },
    { orgId: chapel.id, eventId: easterPast.id, uploaderId: users.mediaLead.id, kind: 'CLIP', url: '/images/posters/prayer-night.png', posterUrl: '/images/posters/prayer-night.png', durationSec: 42, caption: 'Vigil highlights — lives changed ✨', linksToEventId: gospelNight.id },
    { orgId: chapel.id, eventId: easterPast.id, uploaderId: users.mediaLead.id, kind: 'CLIP', url: '/images/posters/gospel-concert.png', posterUrl: '/images/posters/gospel-concert.png', durationSec: 38, caption: 'Easter Passion finale — goosebumps!', linksToEventId: gospelNight.id },
    { orgId: eventCo.id, eventId: foodFestival.id, uploaderId: users.eventCoOwner.id, kind: 'CLIP', url: '/images/posters/food-festival.png', posterUrl: '/images/posters/food-festival.png', durationSec: 35, caption: 'Jollof wars teaser 🔥 #streetfood' },
    { orgId: techAssoc.id, eventId: bootcamp.id, uploaderId: users.techLead.id, kind: 'CLIP', url: '/images/posters/tech-bootcamp.png', posterUrl: '/images/posters/tech-bootcamp.png', durationSec: 47, caption: 'From hello world to production 🚀' },
    { orgId: eventCo.id, eventId: weddingExpo.id, uploaderId: users.eventCoOwner.id, kind: 'CLIP', url: '/images/posters/wedding-expo.png', posterUrl: '/images/posters/wedding-expo.png', durationSec: 33, caption: 'Say yes to the dress(er) 💍' },
    { orgId: ministries.id, eventId: businessSummit.id, uploaderId: users.director.id, kind: 'CLIP', url: '/images/posters/business-summit.png', posterUrl: '/images/posters/business-summit.png', durationSec: 40, caption: 'SME growth stories from last year' },
  ] })

  // ── Social ──────────────────────────────────────────────────────────────
  await db.follow.createMany({ data: [
    { followerId: users.ama.id, orgId: chapel.id }, { followerId: users.ama.id, orgId: ministries.id },
    { followerId: users.kojo.id, orgId: techAssoc.id }, { followerId: users.akua.id, orgId: eventCo.id },
    { followerId: users.kojo.id, orgId: chapel.id }, { followerId: users.akua.id, orgId: chapel.id },
  ] })
  await db.eventInterest.createMany({ data: [
    { userId: users.ama.id, eventId: gospelNight.id, kind: 'GOING', privacy: 'PUBLIC' },
    { userId: users.ama.id, eventId: carols.id, kind: 'SAVE', privacy: 'FOLLOWERS' },
    { userId: users.kojo.id, eventId: bootcamp.id, kind: 'INTEREST', privacy: 'PUBLIC' },
    { userId: users.akua.id, eventId: foodFestival.id, kind: 'GOING', privacy: 'PUBLIC' },
    { userId: users.akua.id, eventId: healthWalk.id, kind: 'SAVE', privacy: 'PRIVATE' },
  ] })
  await db.comment.createMany({ data: [
    { eventId: gospelNight.id, userId: users.ama.id, body: 'I cannot wait! Last year was life-changing 🙌' },
    { eventId: gospelNight.id, userId: users.kojo.id, body: 'Are virtual passes available for family abroad?' },
    { eventId: gospelNight.id, userId: users.akua.id, body: 'Coming with my whole squad 💃' },
    { eventId: bootcamp.id, userId: users.kojo.id, body: 'Is there a certificate at the end?' },
  ] })
  await db.consent.createMany({ data: [
    { userId: users.ama.id, channel: 'SMS', target: '+233240000010', scope: 'MARKETING', source: 'signup' },
    { userId: users.akua.id, channel: 'SMS', target: '+233240000012', scope: 'MARKETING', source: 'signup' },
    { userId: users.ama.id, channel: 'EMAIL', target: 'ama@example.dev', scope: 'MARKETING', source: 'signup' },
    { userId: users.ama.id, channel: 'SMS', target: '+233240000010', scope: 'TRANSACTIONAL', source: 'signup' },
    { userId: users.kojo.id, channel: 'SMS', target: '+233240000011', scope: 'TRANSACTIONAL', source: 'signup' },
  ] })

  // ── Post-event reviews on the ENDED Easter production (real fulfilled tickets) ──
  const easterTicketType = await db.ticketType.create({ data: { eventId: easterPast.id, orgId: chapel.id, name: 'Standard (archived)', description: 'General admission to the 2026 production.', kind: 'PHYSICAL', priceMinor: 8000, quota: 500, perBuyerLimit: 4 } })
  const easterOrderAma = await createOrder({ eventId: easterPast.id, userId: users.ama.id, buyerName: 'Ama Darko', buyerEmail: 'ama@example.dev', buyerPhone: '+233240000010', items: [{ ticketTypeId: easterTicketType.id, qty: 2 }] })
  await seedPaidOrder(easterOrderAma.orderReference, users.ama.id)
  const easterOrderKojo = await createOrder({ eventId: easterPast.id, userId: users.kojo.id, buyerName: 'Kojo Owusu', buyerEmail: 'kojo@example.dev', buyerPhone: '+233240000011', items: [{ ticketTypeId: easterTicketType.id, qty: 1 }] })
  await seedPaidOrder(easterOrderKojo.orderReference, users.kojo.id)
  const easterOrderAkua = await createOrder({ eventId: easterPast.id, userId: users.akua.id, buyerName: 'Akua Frimpong', buyerEmail: 'akua@example.dev', buyerPhone: '+233240000012', items: [{ ticketTypeId: easterTicketType.id, qty: 2 }] })
  await seedPaidOrder(easterOrderAkua.orderReference, users.akua.id)
  await db.eventReview.createMany({ data: [
    { eventId: easterPast.id, userId: users.ama.id, rating: 5, body: 'The finale gave me goosebumps — 200 cast members and the orchestra was flawless. Worth every cedi.' },
    { eventId: easterPast.id, userId: users.kojo.id, rating: 4, body: 'Moving production. Parking near the cathedral was the only struggle — arrive an hour early.' },
    { eventId: easterPast.id, userId: users.akua.id, rating: 5, body: 'We brought our youth group and they are still talking about it. Ushers were wonderful with the children.' },
  ] })
  // The archived production is ENDED — orders above are historical (paid) sales,
  // settled a few days before the 60-day-old event.
  await backdateOrder(easterOrderAma.orderReference, 63, 12)
  await backdateOrder(easterOrderKojo.orderReference, 62, 17)
  await backdateOrder(easterOrderAkua.orderReference, 61, 9)
  // The house was full — ushers scanned most of those tickets in (real scan rows).
  const easterTickets = await db.ticket.findMany({ where: { event: { id: easterPast.id }, order: { status: 'PAID' } }, orderBy: { issuedAt: 'asc' } })
  for (const [index, ticket] of easterTickets.slice(0, Math.max(1, easterTickets.length - 1)).entries()) {
    const scannedAt = daysFromNow(-60, 17 + Math.floor(index / 2), (index * 7) % 60)
    await db.admissionScan.create({ data: { ticketId: ticket.id, eventId: easterPast.id, scannerId: users.usher.id, scannedAt, result: 'ADMITTED', source: 'ONLINE', clientScanId: `seed-scan-${ticket.id}` } })
    await db.ticket.update({ where: { id: ticket.id }, data: { status: 'CHECKED_IN', checkedInAt: scannedAt, checkedInBy: users.usher.id } })
  }
  await db.event.update({ where: { id: easterPast.id }, data: { status: 'ENDED' } })

  // ── Invitation (private dinner) ─────────────────────────────────────────
  const invitation = await db.invitation.create({ data: { eventId: donorsDinner.id, code: 'DONOR2026', displayName: 'Akua Frimpong', contact: 'akua@example.dev', maxGuests: 2, requireApproval: false, createdBy: users.director.id } })
  await db.rsvp.create({ data: { eventId: donorsDinner.id, invitationId: invitation.id, userId: users.akua.id, name: 'Akua Frimpong', email: 'akua@example.dev', guests: 1, status: 'APPROVED', decidedAt: new Date() } })

  // ── Orders through the REAL services (ledger + tickets + fees) ──────────
  const order1 = await createOrder({ eventId: gospelNight.id, userId: users.ama.id, buyerName: 'Ama Darko', buyerEmail: 'ama@example.dev', buyerPhone: '+233240000010', items: [{ ticketTypeId: vip.id, qty: 2 }] })
  await seedPaidOrder(order1.orderReference, users.ama.id)

  const order2 = await createOrder({ eventId: summit.id, userId: users.kojo.id, buyerName: 'Kojo Owusu', buyerEmail: 'kojo@example.dev', buyerPhone: '+233240000011', items: [{ ticketTypeId: summitVirtual.id, qty: 1 }] })
  await seedPaidOrder(order2.orderReference, users.kojo.id)

  const order3 = await createOrder({ eventId: sundayEvents[0].id, userId: users.akua.id, buyerName: 'Akua Frimpong', buyerEmail: 'akua@example.dev', buyerPhone: '+233240000012', items: [{ ticketTypeId: (await db.ticketType.findFirst({ where: { eventId: sundayEvents[0].id } }))!.id, qty: 2 }] })
  await fulfilFreeOrder((await db.order.findUnique({ where: { reference: order3.orderReference } }))!.id)

  // Paid viewing pass for the masterclass broadcast (entitlement demo)
  const order4 = await createOrder({ eventId: masterclass.id, userId: users.ama.id, buyerName: 'Ama Darko', buyerEmail: 'ama@example.dev', buyerPhone: '+233240000010', items: [{ ticketTypeId: (await db.ticketType.create({ data: { eventId: masterclass.id, orgId: ministries.id, name: 'Live + Replay Pass', description: 'Live access + 30-day replay.', kind: 'VIRTUAL', priceMinor: 5000, quota: 300, perBuyerLimit: 2, includesVirtualAccess: true } })).id, qty: 1 }] })
  await seedPaidOrder(order4.orderReference, users.ama.id)
  const amaTicket4 = await db.ticket.findFirst({ where: { order: { reference: order4.orderReference } } })
  if (amaTicket4) {
    await db.viewingEntitlement.create({ data: { userId: users.ama.id, broadcastId: masterclassBroadcast.id, kind: 'TICKET_BENEFIT', status: 'ACTIVE', sourceOrderId: (await db.order.findUnique({ where: { reference: order4.orderReference } }))!.id } })
  }

  // In-flight payment (PENDING) for the finance/reconciliation demo
  const order5 = await createOrder({ eventId: businessSummit.id, userId: users.kojo.id, buyerName: 'Kojo Owusu', buyerEmail: 'kojo@example.dev', buyerPhone: '+233240000011', items: [{ ticketTypeId: (await db.ticketType.findFirst({ where: { eventId: businessSummit.id } }))!.id, qty: 1 }] })
  const order5Row = await db.order.findUnique({ where: { reference: order5.orderReference } })
  if (order5Row) {
    await db.paymentAttempt.create({ data: { orderId: order5Row.id, attemptNo: 1, provider: 'SIMULATOR', reference: paymentReference(order5.orderReference, 1), status: 'REDIRECTED', amountMinor: order5Row.totalMinor, checkoutUrl: `/api/v1/payments/simulator/${paymentReference(order5.orderReference, 1)}` } })
  }

  // ── Sales fortnight for organizer insights (real orders, realistic timing) ──
  const vipRow = await db.ticketType.findFirst({ where: { eventId: gospelNight.id, name: { contains: 'VIP' } } })
  const regularRow = (await db.ticketType.findFirst({ where: { eventId: gospelNight.id, priceMinor: 8000 } })) ?? (await db.ticketType.findFirst({ where: { eventId: gospelNight.id } }))
  if (vipRow && regularRow) {
    const mk = async (userId: string, name: string, email: string, phone: string, items: { ticketTypeId: string; qty: number }[], daysAgo: number, hour: number) => {
      const o = await createOrder({ eventId: gospelNight.id, userId, buyerName: name, buyerEmail: email, buyerPhone: phone, items })
      await seedPaidOrder(o.orderReference, userId)
      await backdateOrder(o.orderReference, daysAgo, hour)
    }
    await mk(users.akua.id, 'Akua Frimpong', 'akua@example.dev', '+233240000012', [{ ticketTypeId: vipRow.id, qty: 1 }], 11, 9)
    await mk(users.usher.id, 'Abena Asante', 'usher@lightworld.dev', '+233240000006', [{ ticketTypeId: regularRow.id, qty: 2 }], 8, 18)
    await mk(users.pastor.id, 'Pastor Samuel Adjei', 'pastor@lightworld.dev', '+233240000003', [{ ticketTypeId: vipRow.id, qty: 2 }], 5, 11)
    await mk(users.kojo.id, 'Kojo Owusu', 'kojo@example.dev', '+233240000011', [{ ticketTypeId: regularRow.id, qty: 1 }], 3, 20)
    await mk(users.ama.id, 'Ama Darko', 'ama@example.dev', '+233240000010', [{ ticketTypeId: vipRow.id, qty: 1 }], 1, 12)
  }
  // Existing orders settle onto the fortnight too; easter sales pre-date their (60d-old) event.
  await backdateOrder(order1.orderReference, 9, 15)
  await backdateOrder(order4.orderReference, 0, 10)

  // ── Refund case + payout demo ───────────────────────────────────────────
  const order2Row = await db.order.findUnique({ where: { reference: order2.orderReference } })
  if (order2Row) {
    await db.refundCase.create({ data: { orderId: order2Row.id, requestedBy: users.director.id, type: 'FULL', amountMinor: order2Row.totalMinor, status: 'REQUESTED', reason: 'Buyer cannot attend the virtual sessions (travel conflict).' } })
    await db.order.update({ where: { id: order2Row.id }, data: { status: 'REFUND_PENDING' } })
  }
  await db.payout.create({ data: { orgId: chapel.id, requestedBy: users.orgFinance.id, amountMinor: 10000, status: 'REQUESTED', destination: JSON.stringify({ momoNumber: '+233240000005', recipientName: 'Lightworld Chapel International' }) } })

  // ── Promotion campaign ──────────────────────────────────────────────────
  const campaign = await db.promotionCampaign.create({ data: { orgId: chapel.id, eventId: gospelNight.id, name: 'Gospel Night — Accra push', budgetMinor: 5000, spentMinor: 0, cpmMinor: 500, status: 'RUNNING', targeting: JSON.stringify({ cities: ['Accra'], categories: ['concert', 'ministry'], interests: ['gospel', 'worship'] }), startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 6 * 86400000) } })
  await db.event.update({ where: { id: gospelNight.id }, data: { boostedUntil: new Date(Date.now() + 6 * 86400000) } })
  const { recordTelemetry } = await import('../src/server/services/promotions')
  for (let i = 0; i < 12; i++) {
    await recordTelemetry({ campaignId: campaign.id, kind: 'IMPRESSION', userId: [users.ama.id, users.kojo.id, users.akua.id][i % 3], dedupKey: `seed-imp-${campaign.id}-${i}` })
  }
  await recordTelemetry({ campaignId: campaign.id, kind: 'CLICK', userId: users.ama.id, dedupKey: `seed-click-${campaign.id}-1` })

  // ── Notifications ───────────────────────────────────────────────────────
  await db.notification.createMany({ data: [
    { userId: users.ama.id, type: 'TICKET_ISSUED', title: 'Your tickets are ready', body: 'Payment confirmed for Accra Gospel Night of Wonders.', link: '#/me?tab=tickets' },
    { userId: users.ama.id, type: 'LIVE_STARTED', title: 'Worship Without Limits is live', body: 'The stream has started — join now.', link: '#/live' },
    { userId: users.kojo.id, type: 'REMINDER', title: 'Coming up: Sunday Celebration Service', body: 'Your event starts within 24 hours.', link: '#/me?tab=tickets' },
  ] })

  // ── CSS effects catalog stats rows ──────────────────────────────────────
  for (const effect of cssEffects) {
    await db.cSSEffect.upsert({
      where: { id: effect.id },
      create: { id: effect.id, name: effect.name, category: effect.category, difficulty: effect.difficulty, demoKind: effect.demoKind, featured: ['neon-pulse-button', 'glassmorphism-card', 'aurora-bg'].includes(effect.id) },
      update: {},
    })
  }

  console.log('✅ Seed complete.')
  console.log('   Dev accounts (password: Dev@12345):')
  console.log('   admin@ieventplux.dev (SUPER_ADMIN), finance@ieventplux.dev (FINANCE_ADMIN),')
  console.log('   moderator@ieventplux.dev, support@ieventplux.dev,')
  console.log('   pastor@lightworld.dev (chapel OWNER), media@lightworld.dev, finance@lightworld.dev, usher@lightworld.dev,')
  console.log('   director@lwministries.dev, ghana@techassoc.dev, accra@eventco.dev (PENDING verification),')
  console.log('   ama@example.dev / kojo@example.dev / akua@example.dev (attendees)')
}

function occurrenceSlug(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Create a SUCCESS payment attempt + run the real fulfilment path (ledger, tickets, SMS queue). */
async function seedPaidOrder(orderRef: string, _userId: string) {
  const order = await db.order.findUnique({ where: { reference: orderRef } })
  if (!order) return
  const reference = paymentReference(orderRef, 1)
  const attempt = await db.paymentAttempt.create({
    data: { orderId: order.id, attemptNo: 1, provider: 'SIMULATOR', reference, status: 'REDIRECTED', amountMinor: order.totalMinor, checkoutUrl: `/api/v1/payments/simulator/${reference}` },
  })
  const { processProviderEvent } = await import('../src/server/services/payments')
  const pe = await db.providerEvent.create({
    data: { provider: 'SIMULATOR', eventType: 'CALLBACK', reference, providerPaymentId: `SIMTX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dedupKey: `seed:${reference}:0000:${order.totalMinor}`, payload: JSON.stringify({ ResponseCode: '0000', Amount: order.totalMinor / 100, Currency: 'GHS', ClientReference: reference }) },
  })
  await processProviderEvent(pe.id)
  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCESS', verifiedAt: new Date() } })
}

/** Dev-seed realism: backdate a settled order (and its issued tickets) so the
 *  organizer insights trend reflects a plausible sales fortnight. */
async function backdateOrder(orderRef: string, daysAgo: number, hour = 14) {
  const when = daysFromNow(-daysAgo, hour, 22)
  await db.order.update({ where: { reference: orderRef }, data: { createdAt: when, paidAt: when } })
  await db.ticket.updateMany({ where: { order: { reference: orderRef } }, data: { issuedAt: when } })
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .then(async () => {
    await db.$disconnect()
    process.exit(0)
  })
