import { Algorithm, hash } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { assertDevelopment, loadEnv } from '@ieventplux/config';

const env = loadEnv();
assertDevelopment(env, 'Development seed');
const client = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const SEED_EPOCH = Date.parse('2026-11-12T00:00:00.000Z');
const TZ = 'Africa/Accra';
const counters = new Map<string, number>();
const nextId = (model: string) => {
  const count = (counters.get(model) ?? 0) + 1;
  counters.set(model, count);
  return `dev-${model}-${String(count).padStart(4, '0')}`;
};
const json = <T extends Prisma.InputJsonValue>(value: T): T => value;
function daysFromNow(days: number, hour = 17, minute = 0): Date {
  const d = new Date(SEED_EPOCH);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}
function occurrenceSlug(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Fixed salt is exclusively for reproducible synthetic development credentials.
  const passwordHash = await hash('Dev@12345', {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    salt: Buffer.from('ieventplux-dev-v1'),
  });
  await client.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(1794474239)`;
      if (
        await db.platformSetting.findUnique({ where: { key: 'dev-seed-v1' } })
      ) {
        console.info('Development seed v1 already applied; no data changed.');
        return;
      }
      await db.country.createMany({
        data: [
          {
            code: 'GH',
            name: 'Ghana',
            currency: 'GHS',
            viewingEnabled: true,
            organizerEnabled: true,
            payoutEnabled: true,
          },
          {
            code: 'GB',
            name: 'United Kingdom',
            currency: 'GBP',
            viewingEnabled: true,
            organizerEnabled: false,
            payoutEnabled: false,
          },
          {
            code: 'US',
            name: 'United States',
            currency: 'USD',
            viewingEnabled: true,
            organizerEnabled: false,
            payoutEnabled: false,
          },
        ],
      });
      const users = {
        admin: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'admin@ieventplux.dev',
            passwordHash,
            displayName: 'Kwabena Mensah',
            platformRole: 'SUPER_ADMIN',
            phone: '+233240000001',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        financeAdmin: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'finance@ieventplux.dev',
            passwordHash,
            displayName: 'Akosua Boateng',
            platformRole: 'FINANCE_ADMIN',
            phone: '+233240000002',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        moderator: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'moderator@ieventplux.dev',
            passwordHash,
            displayName: 'Yao Adzika',
            platformRole: 'MODERATOR',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Ho',
            timezone: TZ,
          },
        }),
        support: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'support@ieventplux.dev',
            passwordHash,
            displayName: 'Efua Sarpong',
            platformRole: 'SUPPORT',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Kumasi',
            timezone: TZ,
          },
        }),
        pastor: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'pastor@lightworld.dev',
            passwordHash,
            displayName: 'Pastor Samuel Adjei',
            phone: '+233240000003',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        mediaLead: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'media@lightworld.dev',
            passwordHash,
            displayName: 'Grace Nkrumah',
            phone: '+233240000004',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        orgFinance: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'finance@lightworld.dev',
            passwordHash,
            displayName: 'Daniel Osei',
            phone: '+233240000005',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        usher: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'usher@lightworld.dev',
            passwordHash,
            displayName: 'Abena Asante',
            phone: '+233240000006',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        director: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'director@lwministries.dev',
            passwordHash,
            displayName: 'Elder Joseph Tetteh',
            phone: '+233240000007',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Tema',
            timezone: TZ,
          },
        }),
        techLead: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'ghana@techassoc.dev',
            passwordHash,
            displayName: 'Nana Kwesi Ampofo',
            phone: '+233240000008',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        eventCoOwner: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'accra@eventco.dev',
            passwordHash,
            displayName: 'Maame Yaa Forson',
            phone: '+233240000009',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
        ama: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'ama@example.dev',
            passwordHash,
            displayName: 'Ama Darko',
            phone: '+233240000010',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
            notifPrefs: { email: true, sms: true, push: true, marketing: true },
          },
        }),
        kojo: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'kojo@example.dev',
            passwordHash,
            displayName: 'Kojo Owusu',
            phone: '+233240000011',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Takoradi',
            timezone: TZ,
            notifPrefs: {
              email: true,
              sms: false,
              push: true,
              marketing: false,
            },
          },
        }),
        akua: await db.user.create({
          data: {
            id: nextId('user'),
            email: 'akua@example.dev',
            passwordHash,
            displayName: 'Akua Frimpong',
            phone: '+233240000012',
            emailVerifiedAt: new Date(SEED_EPOCH),
            city: 'Accra',
            timezone: TZ,
          },
        }),
      };

      // ── Platform config ─────────────────────────────────────────────────────
      await db.feeVersion.create({
        data: {
          id: nextId('feeVersion'),
          version: 1,
          name: 'Launch fees',
          ticketCommissionPct: 500,
          processingFeePct: 195,
          smsRateMinor: 5,
          createdBy: users.admin.id,
        },
      });
      await db.category.createMany({
        data: (
          [
            {
              name: 'Church Service',
              slug: 'church-service',
              icon: 'church',
              color: '#10b981',
              sortOrder: 1,
            },
            {
              name: 'Concert',
              slug: 'concert',
              icon: 'music',
              color: '#f59e0b',
              sortOrder: 2,
            },
            {
              name: 'Conference',
              slug: 'conference',
              icon: 'presentation',
              color: '#0d9488',
              sortOrder: 3,
            },
            {
              name: 'Workshop',
              slug: 'workshop',
              icon: 'wrench',
              color: '#f43f5e',
              sortOrder: 4,
            },
            {
              name: 'Bootcamp',
              slug: 'bootcamp',
              icon: 'code',
              color: '#7c3aed',
              sortOrder: 5,
            },
            {
              name: 'Wedding',
              slug: 'wedding',
              icon: 'heart',
              color: '#ec4899',
              sortOrder: 6,
            },
            {
              name: 'Community',
              slug: 'community',
              icon: 'users',
              color: '#84cc16',
              sortOrder: 7,
            },
            {
              name: 'Ministry',
              slug: 'ministry',
              icon: 'sparkles',
              color: '#d97706',
              sortOrder: 8,
            },
            {
              name: 'Festival',
              slug: 'festival',
              icon: 'party-popper',
              color: '#ef4444',
              sortOrder: 9,
            },
            {
              name: 'Sports & Health',
              slug: 'sports-health',
              icon: 'activity',
              color: '#14b8a6',
              sortOrder: 10,
            },
          ] as const
        ).map((data) => ({ id: nextId('category'), ...data })),
      });
      await db.subscriptionPlan.createMany({
        data: (
          [
            {
              code: 'BASIC',
              name: 'Basic',
              description: 'Get started with ticketed events.',
              priceMinor: 0,
              billingPeriodDays: 30,
              sortOrder: 1,
              entitlements: json({
                maxPublishedEvents: 3,
                teamSeats: 2,
                analytics: false,
                smsPerMonth: 100,
                streamMinutesPerMonth: 60,
                replaysIncluded: false,
              }),
            },
            {
              code: 'PRO',
              name: 'Organizer Pro',
              description: 'For growing ministries and event teams.',
              priceMinor: 14900,
              billingPeriodDays: 30,
              sortOrder: 2,
              entitlements: json({
                maxPublishedEvents: 25,
                teamSeats: 8,
                analytics: true,
                smsPerMonth: 1000,
                streamMinutesPerMonth: 600,
                replaysIncluded: true,
              }),
            },
            {
              code: 'ORG',
              name: 'Organization',
              description: 'Large organizations with multiple teams.',
              priceMinor: 39900,
              billingPeriodDays: 30,
              sortOrder: 3,
              entitlements: json({
                maxPublishedEvents: 200,
                teamSeats: 30,
                analytics: true,
                smsPerMonth: 5000,
                streamMinutesPerMonth: 3000,
                replaysIncluded: true,
              }),
            },
          ] as const
        ).map((data) => ({ id: nextId('subscriptionPlan'), ...data })),
      });

      // ── Organizations ───────────────────────────────────────────────────────
      const chapel = await db.organization.create({
        data: {
          id: nextId('organization'),
          name: 'Lightworld Chapel International',
          slug: 'lightworld-chapel',
          orgType: 'CHURCH',
          tagline: 'Raising a generation of light.',
          description:
            'A Christ-centred congregation in Accra serving the city through worship, word and community outreach.',
          logoUrl: null,
          coverUrl: '/images/posters/prayer-night.png',
          country: 'GH',
          city: 'Accra',
          address: '12 Liberation Road, Accra',
          contactEmail: 'hello@lightworld.dev',
          contactPhone: '+233240000003',
          website: 'https://lightworld.example',
          ownerId: users.pastor.id,
          status: 'ACTIVE',
          verifiedAt: new Date(SEED_EPOCH),
          smsQuotaPerMonth: 1000,
          streamMinutesAllowance: 600,
        },
      });
      await db.organizerVerification.create({
        data: {
          id: nextId('organizerVerification'),
          orgId: chapel.id,
          status: 'APPROVED',
          reviewerId: users.admin.id,
          decidedAt: new Date(SEED_EPOCH),
          notes: 'Registration + bank details verified (synthetic).',
          evidence: json([{ type: 'registration', ref: 'DEV-SYNTH-001' }]),
        },
      });
      await db.membership.createMany({
        data: (
          [
            {
              orgId: chapel.id,
              userId: users.pastor.id,
              role: 'OWNER',
              acceptedAt: new Date(SEED_EPOCH),
            },
            {
              orgId: chapel.id,
              userId: users.mediaLead.id,
              role: 'EVENT_MANAGER',
              acceptedAt: new Date(SEED_EPOCH),
            },
            {
              orgId: chapel.id,
              userId: users.orgFinance.id,
              role: 'FINANCE',
              acceptedAt: new Date(SEED_EPOCH),
            },
            {
              orgId: chapel.id,
              userId: users.usher.id,
              role: 'CHECKIN_STAFF',
              acceptedAt: new Date(SEED_EPOCH),
            },
          ] as const
        ).map((data) => ({ id: nextId('membership'), ...data })),
      });

      const ministries = await db.organization.create({
        data: {
          id: nextId('organization'),
          name: 'Lightworld Ministries',
          slug: 'lightworld-ministries',
          orgType: 'MINISTRY',
          tagline: 'Equipping leaders, serving communities.',
          description:
            'Leadership training, community outreach and mentoring programmes across Ghana.',
          country: 'GH',
          city: 'Tema',
          contactEmail: 'info@lwministries.dev',
          contactPhone: '+233240000007',
          ownerId: users.director.id,
          status: 'ACTIVE',
          verifiedAt: new Date(SEED_EPOCH),
          smsQuotaPerMonth: 500,
        },
      });
      await db.organizerVerification.create({
        data: {
          id: nextId('organizerVerification'),
          orgId: ministries.id,
          status: 'APPROVED',
          reviewerId: users.admin.id,
          decidedAt: new Date(SEED_EPOCH),
          notes: 'Verified (synthetic).',
        },
      });
      await db.membership.createMany({
        data: (
          [
            {
              orgId: ministries.id,
              userId: users.director.id,
              role: 'OWNER',
              acceptedAt: new Date(SEED_EPOCH),
            },
            {
              orgId: ministries.id,
              userId: users.mediaLead.id,
              role: 'EVENT_MANAGER',
              acceptedAt: new Date(SEED_EPOCH),
            },
          ] as const
        ).map((data) => ({ id: nextId('membership'), ...data })),
      });

      const techAssoc = await db.organization.create({
        data: {
          id: nextId('organization'),
          name: 'Ghana Tech Association',
          slug: 'ghana-tech-association',
          orgType: 'ASSOCIATION',
          tagline: "Ghana's community of builders.",
          description:
            'Workshops, bootcamps and meetups for Ghanaian developers and founders.',
          country: 'GH',
          city: 'Accra',
          contactEmail: 'hello@techassoc.dev',
          contactPhone: '+233240000008',
          ownerId: users.techLead.id,
          status: 'ACTIVE',
          verifiedAt: new Date(SEED_EPOCH),
          smsQuotaPerMonth: 300,
        },
      });
      await db.organizerVerification.create({
        data: {
          id: nextId('organizerVerification'),
          orgId: techAssoc.id,
          status: 'APPROVED',
          reviewerId: users.admin.id,
          decidedAt: new Date(SEED_EPOCH),
          notes: 'Verified (synthetic).',
        },
      });
      await db.membership.create({
        data: {
          id: nextId('membership'),
          orgId: techAssoc.id,
          userId: users.techLead.id,
          role: 'OWNER',
          acceptedAt: new Date(SEED_EPOCH),
        },
      });

      const eventCo = await db.organization.create({
        data: {
          id: nextId('organization'),
          name: 'Accra Events & Co.',
          slug: 'accra-events-co',
          orgType: 'COMPANY',
          tagline: 'Unforgettable Accra experiences.',
          description:
            'Premium festivals, expos and lifestyle events in the capital.',
          country: 'GH',
          city: 'Accra',
          contactEmail: 'bookings@eventco.dev',
          contactPhone: '+233240000009',
          ownerId: users.eventCoOwner.id,
          status: 'PENDING_VERIFICATION', // demonstrates the verification workflow
        },
      });
      await db.organizerVerification.create({
        data: {
          id: nextId('organizerVerification'),
          orgId: eventCo.id,
          status: 'PENDING',
          notes: 'Awaiting business registration documents.',
        },
      });
      await db.membership.create({
        data: {
          id: nextId('membership'),
          orgId: eventCo.id,
          userId: users.eventCoOwner.id,
          role: 'OWNER',
          acceptedAt: new Date(SEED_EPOCH),
        },
      });

      const proPlan = await db.subscriptionPlan.findUnique({
        where: { code: 'PRO' },
      });
      const orgPlan = await db.subscriptionPlan.findUnique({
        where: { code: 'ORG' },
      });
      if (proPlan) {
        await db.subscription.create({
          data: {
            id: nextId('subscription'),
            orgId: chapel.id,
            planId: proPlan.id,
            status: 'ACTIVE',
            currentPeriodEnd: new Date(SEED_EPOCH + 18 * 86400000),
          },
        });
        await db.subscription.create({
          data: {
            id: nextId('subscription'),
            orgId: ministries.id,
            planId: proPlan.id,
            status: 'ACTIVE',
            currentPeriodEnd: new Date(SEED_EPOCH + 25 * 86400000),
          },
        });
      }
      if (orgPlan) {
        await db.subscription.create({
          data: {
            id: nextId('subscription'),
            orgId: techAssoc.id,
            planId: orgPlan.id,
            status: 'ACTIVE',
            currentPeriodEnd: new Date(SEED_EPOCH + 12 * 86400000),
          },
        });
      }

      // ── Venues ──────────────────────────────────────────────────────────────
      const cathedral = await db.venue.create({
        data: {
          id: nextId('venue'),
          orgId: chapel.id,
          name: 'Lightworld Cathedral',
          address: '12 Liberation Road',
          city: 'Accra',
          region: 'Greater Accra',
          country: 'GH',
          lat: 5.6037,
          lng: -0.187,
          capacity: 3000,
          mapsUrl: 'https://maps.google.com/?q=Accra',
          accessibilityInfo:
            'Wheelchair ramps at main entrance; reserved seating available.',
        },
      });
      const laboma = await db.venue.create({
        data: {
          id: nextId('venue'),
          orgId: eventCo.id,
          name: 'Laboma Beach Resort',
          address: 'Laboma Beach, La-Accra',
          city: 'Accra',
          country: 'GH',
          lat: 5.5637,
          lng: -0.157,
          capacity: 5000,
          mapsUrl: 'https://maps.google.com/?q=Laboma+Beach',
        },
      });
      const aicc = await db.venue.create({
        data: {
          id: nextId('venue'),
          orgId: ministries.id,
          name: 'Accra International Conference Centre',
          address: 'Liberation Link, Ridge',
          city: 'Accra',
          country: 'GH',
          lat: 5.5717,
          lng: -0.19,
          capacity: 1600,
          mapsUrl: 'https://maps.google.com/?q=AICC+Accra',
        },
      });
      const techHub = await db.venue.create({
        data: {
          id: nextId('venue'),
          orgId: techAssoc.id,
          name: 'Tech Hub Accra',
          address: 'Otu Ave, Cantonments',
          city: 'Accra',
          country: 'GH',
          capacity: 200,
          mapsUrl: 'https://maps.google.com/?q=Cantonments+Accra',
        },
      });

      // ── Recurring series ────────────────────────────────────────────────────
      const series = await db.eventSeries.create({
        data: {
          id: nextId('eventSeries'),
          orgId: chapel.id,
          title: 'Sunday Celebration Service',
          slug: 'sunday-celebration-service',
          description:
            'Weekly celebration service with worship, word and communion.',
          categorySlug: 'church-service',
          timezone: TZ,
          recurrence: json({
            freq: 'WEEKLY',
            byWeekDay: [0],
            time: '09:00',
            durationMin: 120,
          }),
          visibility: 'PUBLIC',
        },
      });

      // ── Events ──────────────────────────────────────────────────────────────
      const gospelNight = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: chapel.id,
          title: 'Accra Gospel Night of Wonders',
          slug: 'accra-gospel-night-of-wonders',
          summary:
            'An unforgettable night of worship with leading Ghanaian gospel artists.',
          description:
            'Join thousands for a power-packed evening of live worship, ministration and testimonies featuring top gospel acts from across Ghana. Gates open at 4pm. Come expecting a miracle!',
          categorySlug: 'concert',
          tags: json(['gospel', 'worship', 'live', 'family']),
          coverImageUrl: '/images/posters/gospel-concert.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: cathedral.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(8, 17),
          endsAt: daysFromNow(8, 21),
          publishedAt: new Date(SEED_EPOCH),
          contactEmail: 'events@lightworld.dev',
          contactPhone: '+233240000003',
          accessibilityInfo:
            'Accessible seating and ushers for mobility support.',
          attendanceRules:
            'Children under 12 free with an adult. No professional cameras.',
          directionsUrl: 'https://maps.google.com/?q=Accra',
          createdBy: users.mediaLead.id,
          isFeatured: true,
        },
      });
      const summit = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: ministries.id,
          title: 'Ministry Leaders Summit 2026',
          slug: 'ministry-leaders-summit-2026',
          summary: 'Equipping church and ministry leaders for greater impact.',
          description:
            'A two-day hybrid summit for pastors, ministry leads and administrators. Tracks on leadership, stewardship, media and technology. In-person includes lunch; virtual includes live sessions and materials.',
          categorySlug: 'conference',
          tags: json(['leadership', 'training', 'hybrid']),
          coverImageUrl: '/images/posters/church-conference.png',
          mode: 'HYBRID',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: aicc.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(21, 9),
          endsAt: daysFromNow(22, 16),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.director.id,
          isFeatured: true,
        },
      });
      const vigil = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: chapel.id,
          title: 'All-Night Prayer Vigil — December Edition',
          slug: 'all-night-prayer-vigil-december',
          summary: 'Crossing into the new month with prayer and worship.',
          description:
            'An all-night vigil of intercession for the nation and families. Free admission with RSVP. Candles provided.',
          categorySlug: 'ministry',
          tags: json(['prayer', 'night', 'free']),
          coverImageUrl: '/images/posters/prayer-night.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: cathedral.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(5, 22),
          endsAt: daysFromNow(6, 4),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.pastor.id,
        },
      });
      const weddingExpo = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: eventCo.id,
          title: 'Luxury Wedding & Bridal Expo',
          slug: 'luxury-wedding-bridal-expo',
          summary: "Ghana's most elegant wedding showcase.",
          description:
            'Meet top wedding vendors, designers and planners under one roof. Runway shows every hour.',
          categorySlug: 'wedding',
          tags: json(['wedding', 'expo', 'luxury']),
          coverImageUrl: '/images/posters/wedding-expo.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: laboma.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(14, 10),
          endsAt: daysFromNow(14, 18),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.eventCoOwner.id,
        },
      });
      const bootcamp = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: techAssoc.id,
          title: 'Full-Stack Web Development Bootcamp',
          slug: 'full-stack-web-dev-bootcamp',
          summary: '8 weeks from zero to deployable apps.',
          description:
            'Intensive evening classes covering TypeScript, React, Node.js and deployment. Certificate on completion.',
          categorySlug: 'bootcamp',
          tags: json(['tech', 'coding', 'career']),
          coverImageUrl: '/images/posters/tech-bootcamp.png',
          mode: 'VIRTUAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(10, 18),
          endsAt: daysFromNow(66, 21),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.techLead.id,
          isFeatured: true,
        },
      });
      const businessSummit = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: ministries.id,
          title: 'SME Growth & Trade Summit',
          slug: 'sme-growth-trade-summit',
          summary: 'Practical growth playbooks for Ghanaian SMEs.',
          description:
            'Sessions on financing, exports, digital tools and compliance. Network with lenders and partners.',
          categorySlug: 'conference',
          tags: json(['business', 'sme', 'networking']),
          coverImageUrl: '/images/posters/business-summit.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: aicc.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(16, 9),
          endsAt: daysFromNow(16, 17),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.director.id,
        },
      });
      const artsWorkshop = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: ministries.id,
          title: 'Youth Creative Arts Workshop',
          slug: 'youth-creative-arts-workshop',
          summary: 'Free hands-on arts weekend for ages 13–19.',
          description:
            'Painting, crafts and storytelling sessions led by professional artists. All materials provided free.',
          categorySlug: 'workshop',
          tags: json(['youth', 'arts', 'free']),
          coverImageUrl: '/images/posters/youth-workshop.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          country: 'GH',
          city: 'Tema',
          timezone: TZ,
          startsAt: daysFromNow(7, 10),
          endsAt: daysFromNow(7, 15),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.director.id,
          ageGuidance: 'Ages 13–19',
        },
      });
      const foodFestival = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: eventCo.id,
          title: 'Accra Street Food Festival',
          slug: 'accra-street-food-festival',
          summary: 'Taste the city: 100+ vendors, live bands.',
          description:
            'Jollof wars, kelewele alley, live highlife bands and a kids zone. Tickets at the gate cost more — buy early!',
          categorySlug: 'festival',
          tags: json(['food', 'family', 'festival']),
          coverImageUrl: '/images/posters/food-festival.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: laboma.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(12, 11),
          endsAt: daysFromNow(12, 23),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.eventCoOwner.id,
        },
      });
      const healthWalk = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: eventCo.id,
          title: 'City Health Walk & Mini Marathon',
          slug: 'city-health-walk-marathon',
          summary: '10km walk, 5km fun run — free entry.',
          description:
            'A free community health movement. Free t-shirts for the first 500 registrants.',
          categorySlug: 'sports-health',
          tags: json(['fitness', 'community', 'free']),
          coverImageUrl: '/images/posters/health-walk.png',
          mode: 'PHYSICAL',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(18, 6),
          endsAt: daysFromNow(18, 11),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.eventCoOwner.id,
        },
      });
      const carols = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: chapel.id,
          title: 'Carols by Candlelight Night',
          slug: 'carols-by-candlelight',
          summary: 'The beloved annual candlelight carols service.',
          description:
            'Nine lessons and carols with the mass choir, orchestra and guest minstrels. Hot chocolate after service.',
          categorySlug: 'concert',
          tags: json(['christmas', 'carols', 'family']),
          coverImageUrl: '/images/posters/carols-night.png',
          mode: 'HYBRID',
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
          venueId: cathedral.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(35, 19),
          endsAt: daysFromNow(35, 21),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.mediaLead.id,
        },
      });
      const easterPast = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: chapel.id,
          title: 'Easter Passion Live 2026',
          slug: 'easter-passion-live-2026',
          summary: 'A dramatic musical journey through the passion of Christ.',
          description:
            'A full stage production with 200 cast members. Thank you to everyone who joined us!',
          categorySlug: 'concert',
          tags: json(['easter', 'production']),
          coverImageUrl: '/images/posters/prayer-night.png',
          mode: 'HYBRID',
          visibility: 'PUBLIC',
          status: 'ENDED',
          venueId: cathedral.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(-60, 18),
          endsAt: daysFromNow(-60, 21),
          publishedAt: daysFromNow(-90),
          createdBy: users.mediaLead.id,
        },
      });
      await db.event.create({
        data: {
          id: nextId('event'),
          orgId: techAssoc.id,
          title: 'Board Strategy Retreat',
          slug: 'board-strategy-retreat',
          summary: 'Private board planning session.',
          description:
            'Closed-door strategy session for association board members only.',
          categorySlug: 'conference',
          tags: json(['strategy']),
          coverImageUrl: '/images/posters/business-summit.png',
          mode: 'PHYSICAL',
          visibility: 'UNLISTED',
          status: 'PUBLISHED',
          venueId: techHub.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(9, 9),
          endsAt: daysFromNow(9, 16),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.techLead.id,
        },
      });
      const donorsDinner = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: ministries.id,
          title: "Private Donors' Appreciation Dinner",
          slug: 'private-donors-appreciation-dinner',
          summary: 'An invitation-only evening honouring our partners.',
          description:
            'By invitation only. Kindly RSVP with your invitation code.',
          categorySlug: 'community',
          tags: json(['donors', 'private']),
          coverImageUrl: '/images/posters/wedding-expo.png',
          mode: 'PHYSICAL',
          visibility: 'INVITE_ONLY',
          status: 'PUBLISHED',
          venueId: aicc.id,
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: daysFromNow(6, 18),
          endsAt: daysFromNow(6, 22),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.director.id,
        },
      });
      const worshipLive = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: chapel.id,
          title: 'Worship Without Limits — Live Stream',
          slug: 'worship-without-limits-live',
          summary: ' LIVE NOW: spontaneous worship night streaming worldwide.',
          description:
            'Join the spontaneous worship atmosphere from the Upper Room Auditorium. Free live stream; replay available for ticket holders of the Gospel Night.',
          categorySlug: 'ministry',
          tags: json(['live', 'worship', 'stream']),
          coverImageUrl: '/images/posters/gospel-concert.png',
          mode: 'VIRTUAL',
          visibility: 'PUBLIC',
          status: 'LIVE',
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: new Date(SEED_EPOCH - 45 * 60000),
          endsAt: new Date(SEED_EPOCH + 105 * 60000),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.mediaLead.id,
        },
      });
      const masterclass = await db.event.create({
        data: {
          id: nextId('event'),
          orgId: ministries.id,
          title: 'Paid Masterclass: Event Financing 101',
          slug: 'masterclass-event-financing-101',
          summary:
            'LIVE paid masterclass on financing events and settling payouts.',
          description:
            'A 90-minute live masterclass for event organizers covering collections, fees, refunds and payout discipline. Includes replay access for 30 days.',
          categorySlug: 'workshop',
          tags: json(['finance', 'masterclass', 'live']),
          coverImageUrl: '/images/posters/business-summit.png',
          mode: 'VIRTUAL',
          visibility: 'PUBLIC',
          status: 'LIVE',
          country: 'GH',
          city: 'Accra',
          timezone: TZ,
          startsAt: new Date(SEED_EPOCH - 10 * 60000),
          endsAt: new Date(SEED_EPOCH + 80 * 60000),
          publishedAt: new Date(SEED_EPOCH),
          createdBy: users.director.id,
        },
      });

      // Sunday series occurrences (4)
      const sundayEvents: { id: string; startsAt: Date }[] = [];
      for (let i = 0; i < 4; i++) {
        const next = new Date(SEED_EPOCH);
        const daysToSunday = (7 - next.getUTCDay()) % 7 || 7;
        next.setUTCDate(next.getUTCDate() + daysToSunday + i * 7);
        next.setUTCHours(9, 0, 0, 0);
        const ends = new Date(next.getTime() + 2 * 3600000);
        const occ = await db.event.create({
          data: {
            id: nextId('event'),
            orgId: chapel.id,
            seriesId: series.id,
            title: 'Sunday Celebration Service',
            slug: `sunday-celebration-service-${occurrenceSlug(next)}`,
            summary:
              'Weekly celebration service with worship, word and communion.',
            description:
              'Join us every Sunday at 9am for worship, the word and communion. Free RSVP helps us plan seating.',
            categorySlug: 'church-service',
            tags: json(['church', 'weekly', 'free']),
            coverImageUrl: '/images/posters/prayer-night.png',
            mode: 'PHYSICAL',
            visibility: 'PUBLIC',
            status: 'PUBLISHED',
            venueId: cathedral.id,
            country: 'GH',
            city: 'Accra',
            timezone: TZ,
            startsAt: next,
            endsAt: ends,
            publishedAt: new Date(SEED_EPOCH),
            createdBy: users.pastor.id,
          },
        });
        sundayEvents.push({ id: occ.id, startsAt: next });
        await db.ticketType.create({
          data: {
            id: nextId('ticketType'),
            eventId: occ.id,
            orgId: chapel.id,
            name: 'Open Seating (Free RSVP)',
            description: 'Free admission with RSVP.',
            kind: 'PHYSICAL',
            priceMinor: 0,
            quota: 800,
            perBuyerLimit: 5,
          },
        });
      }

      // ── Ticket types ────────────────────────────────────────────────────────
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: gospelNight.id,
          orgId: chapel.id,
          name: 'VIP Front Block',
          description:
            'Premium seating with reserved parking and express entry.',
          kind: 'PHYSICAL',
          priceMinor: 20000,
          quota: 100,
          perBuyerLimit: 4,
          includesVirtualAccess: true,
          saleEndsAt: daysFromNow(7),
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: gospelNight.id,
          orgId: chapel.id,
          name: 'Regular',
          description: 'Open field seating. Gates open 4pm.',
          kind: 'PHYSICAL',
          priceMinor: 8000,
          quota: 2000,
          perBuyerLimit: 6,
          saleEndsAt: daysFromNow(7),
          groupMinQty: 5,
          groupPctOff: 10,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: gospelNight.id,
          orgId: chapel.id,
          name: 'Virtual Live Pass',
          description: 'Watch the live stream from anywhere.',
          kind: 'VIRTUAL',
          priceMinor: 3000,
          quota: 5000,
          perBuyerLimit: 2,
        },
      });
      await db.discountCode.create({
        data: {
          id: nextId('discountCode'),
          eventId: gospelNight.id,
          code: 'GOSPEL10',
          pctOff: 10,
          maxUses: 200,
        },
      });

      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: summit.id,
          orgId: ministries.id,
          name: 'In-person (2 days)',
          description: 'Full access both days incl. lunch and materials.',
          kind: 'PHYSICAL',
          priceMinor: 35000,
          quota: 400,
          perBuyerLimit: 4,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: summit.id,
          orgId: ministries.id,
          name: 'Virtual Access',
          description: 'Live sessions + digital materials.',
          kind: 'VIRTUAL',
          priceMinor: 12000,
          quota: 2000,
          perBuyerLimit: 2,
          includesVirtualAccess: true,
        },
      });

      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: vigil.id,
          orgId: chapel.id,
          name: 'Free RSVP',
          description: 'Free admission — RSVP to reserve your seat.',
          kind: 'PHYSICAL',
          priceMinor: 0,
          quota: 1500,
          perBuyerLimit: 4,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: weddingExpo.id,
          orgId: eventCo.id,
          name: 'General Entry',
          description: 'One-day entry to all showcase areas.',
          kind: 'PHYSICAL',
          priceMinor: 15000,
          quota: 1200,
          perBuyerLimit: 6,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: bootcamp.id,
          orgId: techAssoc.id,
          name: 'Cohort Tuition',
          description: 'Full 8-week cohort with certificate.',
          kind: 'VIRTUAL',
          priceMinor: 90000,
          quota: 60,
          perBuyerLimit: 1,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: businessSummit.id,
          orgId: ministries.id,
          name: 'Standard',
          description: 'Full-day access.',
          kind: 'PHYSICAL',
          priceMinor: 25000,
          quota: 600,
          perBuyerLimit: 5,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: artsWorkshop.id,
          orgId: ministries.id,
          name: 'Free Registration',
          description: 'All materials provided.',
          kind: 'PHYSICAL',
          priceMinor: 0,
          quota: 120,
          perBuyerLimit: 2,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: foodFestival.id,
          orgId: eventCo.id,
          name: 'Early Bird',
          description: 'Single-day entry before 2pm.',
          kind: 'PHYSICAL',
          priceMinor: 4000,
          quota: 3000,
          perBuyerLimit: 8,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: healthWalk.id,
          orgId: eventCo.id,
          name: 'Free Registration',
          description: 'Free entry — t-shirt for first 500.',
          kind: 'PHYSICAL',
          priceMinor: 0,
          quota: 2000,
          perBuyerLimit: 4,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: carols.id,
          orgId: chapel.id,
          name: 'Candlelight Seat',
          description: 'Reserved candlelight seating.',
          kind: 'PHYSICAL',
          priceMinor: 6000,
          quota: 1200,
          perBuyerLimit: 6,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: carols.id,
          orgId: chapel.id,
          name: 'Carols Live Stream',
          description: 'Watch from home with the full choir mix.',
          kind: 'VIRTUAL',
          priceMinor: 2000,
          quota: 3000,
          perBuyerLimit: 2,
        },
      });
      await db.ticketType.create({
        data: {
          id: nextId('ticketType'),
          eventId: worshipLive.id,
          orgId: chapel.id,
          name: 'Free Live Stream',
          description: 'Free access to the live worship stream.',
          kind: 'VIRTUAL',
          priceMinor: 0,
          quota: 10000,
          perBuyerLimit: 1,
        },
      });

      // ── Live broadcasts ─────────────────────────────────────────────────────
      await db.liveBroadcast.create({
        data: {
          id: nextId('liveBroadcast'),
          eventId: worshipLive.id,
          title: 'Worship Without Limits — Main Stage',
          description: 'Live from the Upper Room Auditorium.',
          accessPolicy: 'FREE',
          status: 'LIVE',
          startedAt: new Date(SEED_EPOCH - 45 * 60000),
          viewerCapacity: 2000,
          createdById: users.mediaLead.id,
        },
      });
      await db.liveBroadcast.create({
        data: {
          id: nextId('liveBroadcast'),
          eventId: masterclass.id,
          title: 'Event Financing 101 — Live Masterclass',
          description: 'Live + 30-day replay included.',
          accessPolicy: 'PAID',
          priceMinor: 5000,
          status: 'LIVE',
          startedAt: new Date(SEED_EPOCH - 10 * 60000),
          viewerCapacity: 500,
          createdById: users.director.id,
        },
      });
      await db.liveBroadcast.create({
        data: {
          id: nextId('liveBroadcast'),
          eventId: easterPast.id,
          title: 'Easter Passion Live — Replay',
          description: 'Full recording of the 2026 production.',
          accessPolicy: 'TICKET_HOLDERS',
          status: 'ENDED',
          startedAt: daysFromNow(-60, 18),
          endedAt: daysFromNow(-60, 21),
          recordingStatus: 'AVAILABLE',
          replayPriceMinor: 2000,
          createdById: users.mediaLead.id,
        },
      });

      // ── Media (posters as gallery + synthetic clips for reels) ──────────────
      await db.mediaAsset.createMany({
        data: (
          [
            {
              orgId: chapel.id,
              eventId: gospelNight.id,
              uploaderId: users.mediaLead.id,
              kind: 'GALLERY',
              url: '/images/posters/gospel-concert.png',
              caption: 'Main stage setup',
            },
            {
              orgId: chapel.id,
              eventId: gospelNight.id,
              uploaderId: users.mediaLead.id,
              kind: 'GALLERY',
              url: '/images/posters/carols-night.png',
              caption: 'Choir rehearsal',
            },
            {
              orgId: chapel.id,
              eventId: easterPast.id,
              uploaderId: users.mediaLead.id,
              kind: 'CLIP',
              url: '/images/posters/prayer-night.png',
              posterUrl: '/images/posters/prayer-night.png',
              durationSec: 42,
              caption: 'Vigil highlights — lives changed ✨',
              linksToEventId: gospelNight.id,
            },
            {
              orgId: chapel.id,
              eventId: easterPast.id,
              uploaderId: users.mediaLead.id,
              kind: 'CLIP',
              url: '/images/posters/gospel-concert.png',
              posterUrl: '/images/posters/gospel-concert.png',
              durationSec: 38,
              caption: 'Easter Passion finale — goosebumps!',
              linksToEventId: gospelNight.id,
            },
            {
              orgId: eventCo.id,
              eventId: foodFestival.id,
              uploaderId: users.eventCoOwner.id,
              kind: 'CLIP',
              url: '/images/posters/food-festival.png',
              posterUrl: '/images/posters/food-festival.png',
              durationSec: 35,
              caption: 'Jollof wars teaser 🔥 #streetfood',
            },
            {
              orgId: techAssoc.id,
              eventId: bootcamp.id,
              uploaderId: users.techLead.id,
              kind: 'CLIP',
              url: '/images/posters/tech-bootcamp.png',
              posterUrl: '/images/posters/tech-bootcamp.png',
              durationSec: 47,
              caption: 'From hello world to production 🚀',
            },
            {
              orgId: eventCo.id,
              eventId: weddingExpo.id,
              uploaderId: users.eventCoOwner.id,
              kind: 'CLIP',
              url: '/images/posters/wedding-expo.png',
              posterUrl: '/images/posters/wedding-expo.png',
              durationSec: 33,
              caption: 'Say yes to the dress(er) 💍',
            },
            {
              orgId: ministries.id,
              eventId: businessSummit.id,
              uploaderId: users.director.id,
              kind: 'CLIP',
              url: '/images/posters/business-summit.png',
              posterUrl: '/images/posters/business-summit.png',
              durationSec: 40,
              caption: 'SME growth stories from last year',
            },
          ] as const
        ).map((data) => ({ id: nextId('mediaAsset'), ...data })),
      });

      // ── Social ──────────────────────────────────────────────────────────────
      await db.follow.createMany({
        data: (
          [
            { followerId: users.ama.id, orgId: chapel.id },
            { followerId: users.ama.id, orgId: ministries.id },
            { followerId: users.kojo.id, orgId: techAssoc.id },
            { followerId: users.akua.id, orgId: eventCo.id },
            { followerId: users.kojo.id, orgId: chapel.id },
            { followerId: users.akua.id, orgId: chapel.id },
          ] as const
        ).map((data) => ({ id: nextId('follow'), ...data })),
      });
      await db.eventInterest.createMany({
        data: (
          [
            {
              userId: users.ama.id,
              eventId: gospelNight.id,
              kind: 'GOING',
              privacy: 'PUBLIC',
            },
            {
              userId: users.ama.id,
              eventId: carols.id,
              kind: 'SAVE',
              privacy: 'FOLLOWERS',
            },
            {
              userId: users.kojo.id,
              eventId: bootcamp.id,
              kind: 'INTEREST',
              privacy: 'PUBLIC',
            },
            {
              userId: users.akua.id,
              eventId: foodFestival.id,
              kind: 'GOING',
              privacy: 'PUBLIC',
            },
            {
              userId: users.akua.id,
              eventId: healthWalk.id,
              kind: 'SAVE',
              privacy: 'PRIVATE',
            },
          ] as const
        ).map((data) => ({ id: nextId('eventInterest'), ...data })),
      });
      await db.comment.createMany({
        data: (
          [
            {
              eventId: gospelNight.id,
              userId: users.ama.id,
              body: 'I cannot wait! Last year was life-changing 🙌',
            },
            {
              eventId: gospelNight.id,
              userId: users.kojo.id,
              body: 'Are virtual passes available for family abroad?',
            },
            {
              eventId: gospelNight.id,
              userId: users.akua.id,
              body: 'Coming with my whole squad 💃',
            },
            {
              eventId: bootcamp.id,
              userId: users.kojo.id,
              body: 'Is there a certificate at the end?',
            },
          ] as const
        ).map((data) => ({ id: nextId('comment'), ...data })),
      });
      await db.consent.createMany({
        data: (
          [
            {
              userId: users.ama.id,
              channel: 'SMS',
              target: '+233240000010',
              scope: 'MARKETING',
              source: 'signup',
            },
            {
              userId: users.akua.id,
              channel: 'SMS',
              target: '+233240000012',
              scope: 'MARKETING',
              source: 'signup',
            },
            {
              userId: users.ama.id,
              channel: 'EMAIL',
              target: 'ama@example.dev',
              scope: 'MARKETING',
              source: 'signup',
            },
            {
              userId: users.ama.id,
              channel: 'SMS',
              target: '+233240000010',
              scope: 'TRANSACTIONAL',
              source: 'signup',
            },
            {
              userId: users.kojo.id,
              channel: 'SMS',
              target: '+233240000011',
              scope: 'TRANSACTIONAL',
              source: 'signup',
            },
          ] as const
        ).map((data) => ({ id: nextId('consent'), ...data })),
      });

      // ── Invitation (private dinner) ─────────────────────────────────────────
      const invitation = await db.invitation.create({
        data: {
          id: nextId('invitation'),
          eventId: donorsDinner.id,
          code: 'DONOR2026',
          displayName: 'Akua Frimpong',
          contact: 'akua@example.dev',
          maxGuests: 2,
          requireApproval: false,
          createdBy: users.director.id,
        },
      });
      await db.rsvp.create({
        data: {
          id: nextId('rsvp'),
          eventId: donorsDinner.id,
          invitationId: invitation.id,
          userId: users.akua.id,
          name: 'Akua Frimpong',
          email: 'akua@example.dev',
          guests: 1,
          status: 'APPROVED',
          decidedAt: new Date(SEED_EPOCH),
        },
      });

      const usherMembership = await db.membership.findUniqueOrThrow({
        where: { orgId_userId: { orgId: chapel.id, userId: users.usher.id } },
      });
      await db.eventStaff.create({
        data: {
          id: 'dev-event-staff-usher',
          eventId: gospelNight.id,
          membershipId: usherMembership.id,
        },
      });
      for (const [code, name, type] of [
        ['CASH_CLEARING', 'Hubtel receivable', 'ASSET'],
        ['PLATFORM_FEE_REVENUE', 'Platform commissions', 'REVENUE'],
        ['PROCESSING_FEE_EXPENSE', 'Processing fees', 'EXPENSE'],
        ['PROCESSING_FEE_RECOVERY', 'Processing fee recovery', 'REVENUE'],
        ['SMS_REVENUE', 'SMS revenue', 'REVENUE'],
        ['VIDEO_REVENUE', 'Video revenue', 'REVENUE'],
        ['REFUNDS_PAYABLE', 'Refunds payable', 'LIABILITY'],
        ['PAYOUTS_CLEARING', 'Payout clearing', 'LIABILITY'],
      ] as const) {
        await db.ledgerAccount.create({
          data: { id: 'dev-platform-' + code, code, name, type },
        });
      }
      for (const org of [chapel, ministries, techAssoc, eventCo]) {
        for (const code of ['ORG_PAYABLE', 'ORG_HOLD']) {
          await db.ledgerAccount.create({
            data: {
              id: org.id + '-' + code,
              orgId: org.id,
              code,
              name: code,
              type: 'LIABILITY',
            },
          });
        }
      }
      await db.notificationTemplate.createMany({
        data: [
          {
            id: 'dev-template-ticket-email',
            code: 'TICKET_ISSUED',
            channel: 'EMAIL',
            subject: 'Your iEventPlux tickets',
            body: 'Your tickets for {{eventTitle}} are ready: {{ticketUrl}}',
          },
          {
            id: 'dev-template-ticket-sms',
            code: 'TICKET_ISSUED',
            channel: 'SMS',
            body: 'iEventPlux: your ticket for {{eventTitle}}: {{ticketUrl}}',
          },
          {
            id: 'dev-template-reminder',
            code: 'REMINDER',
            channel: 'SMS',
            body: 'Reminder: {{eventTitle}} starts at {{startsAt}}.',
          },
          {
            id: 'dev-template-verify',
            code: 'VERIFY_CONTACT',
            channel: 'EMAIL',
            subject: 'Verify your email',
            body: 'Your verification code is {{code}}.',
          },
        ],
      });
      const vip = await db.ticketType.findFirstOrThrow({
        where: { eventId: gospelNight.id, name: 'VIP Front Block' },
      });
      const paidOrder = await db.order.create({
        data: {
          id: 'dev-order-paid',
          reference: 'ORD-DEV-PAID-001',
          orgId: chapel.id,
          eventId: gospelNight.id,
          userId: users.ama.id,
          buyerName: users.ama.displayName,
          buyerEmail: users.ama.email,
          kind: 'PAID',
          status: 'PAID',
          subtotalMinor: 40000,
          platformFeeMinor: 2000,
          totalMinor: 40000,
          feeVersionId: 'dev-feeVersion-0001',
          feeSnapshot: { ticketCommissionBps: 500, payer: 'organizer' },
          paidAt: new Date(SEED_EPOCH),
        },
      });
      const paidItem = await db.orderItem.create({
        data: {
          id: 'dev-order-item-paid',
          orderId: paidOrder.id,
          ticketTypeId: vip.id,
          qty: 2,
          unitPriceMinor: 20000,
          lineTotalMinor: 40000,
        },
      });
      await db.paymentAttempt.create({
        data: {
          id: 'dev-payment-paid',
          orderId: paidOrder.id,
          reference: 'DEV-PAID-001-A1',
          provider: 'SIMULATOR',
          status: 'SUCCESS',
          amountMinor: 40000,
          verifiedAt: new Date(SEED_EPOCH),
          rawResult: { synthetic: true },
        },
      });
      await db.ledgerJournal.create({
        data: {
          id: 'dev-journal-paid',
          idempotencyKey: 'order-payment:dev-order-paid:dev-payment-paid',
          orgId: chapel.id,
          refType: 'ORDER_PAYMENT',
          refId: paidOrder.id,
          memo: 'Synthetic seeded collection',
          createdBy: users.admin.id,
        },
      });
      await db.ledgerEntry.createMany({
        data: [
          {
            id: 'dev-entry-cash',
            journalId: 'dev-journal-paid',
            accountId: 'dev-platform-CASH_CLEARING',
            direction: 'DEBIT',
            amountMinor: 40000n,
          },
          {
            id: 'dev-entry-fee',
            journalId: 'dev-journal-paid',
            accountId: 'dev-platform-PLATFORM_FEE_REVENUE',
            direction: 'CREDIT',
            amountMinor: 2000n,
          },
          {
            id: 'dev-entry-org',
            journalId: 'dev-journal-paid',
            accountId: chapel.id + '-ORG_PAYABLE',
            direction: 'CREDIT',
            amountMinor: 38000n,
          },
        ],
      });
      for (const seq of [1, 2]) {
        const id = 'dev-ticket-paid-' + seq;
        await db.ticket.create({
          data: {
            id,
            eventId: gospelNight.id,
            ticketTypeId: vip.id,
            orderId: paidOrder.id,
            orderItemId: paidItem.id,
            seq,
            userId: users.ama.id,
            holderName: users.ama.displayName,
            holderEmail: users.ama.email,
            code: 'TKT-DEV-PAID-00' + seq,
            qrSecret: createHash('sha256').update(id).digest('hex'),
            issuedAt: new Date(SEED_EPOCH),
          },
        });
      }
      await db.ticketType.update({
        where: { id: vip.id },
        data: { soldCount: 2 },
      });
      const freeType = await db.ticketType.findFirstOrThrow({
        where: { eventId: sundayEvents[0]!.id },
      });
      await db.order.create({
        data: {
          id: 'dev-order-free',
          reference: 'ORD-DEV-FREE-001',
          orgId: chapel.id,
          eventId: freeType.eventId,
          userId: users.akua.id,
          buyerName: users.akua.displayName,
          buyerEmail: users.akua.email,
          kind: 'FREE',
          status: 'FULFILLED',
        },
      });
      await db.orderItem.create({
        data: {
          id: 'dev-order-item-free',
          orderId: 'dev-order-free',
          ticketTypeId: freeType.id,
          qty: 1,
          unitPriceMinor: 0,
          lineTotalMinor: 0,
        },
      });
      await db.ticket.create({
        data: {
          id: 'dev-ticket-free',
          eventId: freeType.eventId,
          ticketTypeId: freeType.id,
          orderId: 'dev-order-free',
          orderItemId: 'dev-order-item-free',
          seq: 1,
          userId: users.akua.id,
          holderName: users.akua.displayName,
          holderEmail: users.akua.email,
          code: 'TKT-DEV-FREE-001',
          qrSecret: createHash('sha256')
            .update('dev-ticket-free')
            .digest('hex'),
          issuedAt: new Date(SEED_EPOCH),
        },
      });
      await db.ticketType.update({
        where: { id: freeType.id },
        data: { soldCount: 1 },
      });
      await db.refundCase.create({
        data: {
          id: 'dev-refund-request',
          orderId: paidOrder.id,
          requestedBy: users.ama.id,
          type: 'PARTIAL',
          amountMinor: 20000,
          reason: 'Synthetic unsupported partial refund for operations review',
          status: 'MANUAL_TRACKED',
          ticketIds: ['dev-ticket-paid-2'],
          resolutionNote:
            'No provider refund was initiated; manual workflow demonstration only.',
        },
      });
      await db.payout.create({
        data: {
          id: 'dev-payout-request',
          reference: 'PAY-DEV-001',
          orgId: chapel.id,
          requestedBy: users.orgFinance.id,
          amountMinor: 10000,
          status: 'REQUESTED',
          destination: {
            synthetic: true,
            maskedLabel: 'Development destination ••••0003',
          },
        },
      });
      await db.promotionCampaign.create({
        data: {
          id: 'dev-promotion',
          orgId: chapel.id,
          eventId: gospelNight.id,
          name: 'Gospel Night launch campaign',
          budgetMinor: 5000,
          spentMinor: 0,
          status: 'SCHEDULED',
          targeting: { cities: ['Accra'] },
          startsAt: daysFromNow(1),
          endsAt: daysFromNow(7),
        },
      });
      await db.notification.create({
        data: {
          id: 'dev-notification-ticket',
          userId: users.ama.id,
          type: 'TICKET_ISSUED',
          title: 'Your Gospel Night tickets',
          body: 'Your two synthetic development tickets are ready.',
          link: '/tickets',
          createdAt: new Date(SEED_EPOCH),
        },
      });
      await db.platformSetting.create({
        data: {
          key: 'dev-seed-v1',
          value: { epoch: new Date(SEED_EPOCH).toISOString(), synthetic: true },
        },
      });
      console.info(
        'Development seed complete: 14 users, 4 organizations, 19 events, plans, fees, countries and notification templates.',
      );
    },
    { timeout: 60000 },
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.$disconnect());
