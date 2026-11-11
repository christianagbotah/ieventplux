import { NextRequest } from 'next/server'
import { handle, jsonOk } from '@/server/api'

/**
 * Versioned OpenAPI contract (hand-maintained; served as JSON at /api/v1/openapi).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    void req
    const p = (name: string) => ({ name, in: 'query' as const, schema: { type: 'string' } })
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'iEventPlux API',
        version: '1.0.0',
        description:
          'Events discovery, ticketing, social and broadcasting platform for Ghana. Money is integer minor units (pesewas). Unlisted/invitation-only events are excluded from all discovery endpoints. Payment state changes only via provider callbacks or authenticated reconciliation — never via browser returns.',
      },
      servers: [{ url: '/api/v1' }],
      tags: [
        { name: 'auth' }, { name: 'events' }, { name: 'discovery' }, { name: 'social' }, { name: 'orders' },
        { name: 'payments' }, { name: 'tickets' }, { name: 'checkin' }, { name: 'orgs' }, { name: 'finance' },
        { name: 'subscriptions' }, { name: 'promotions' }, { name: 'broadcasts' }, { name: 'messaging' },
        { name: 'notifications' }, { name: 'ai' }, { name: 'effects' }, { name: 'admin' },
      ],
      components: {
        schemas: {
          Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
          Paginated: { type: 'object', properties: { items: { type: 'array', items: {} }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }, hasMore: { type: 'boolean' } } },
        },
      },
      paths: {
        '/health': { get: { tags: ['admin'], summary: 'Health + integration status' } },
        '/auth/{action}': {
          get: { tags: ['auth'], summary: 'me | sessions' },
          post: {
            tags: ['auth'],
            summary: 'register|login|logout|elevate|verify-contact|resend-code|password-reset|password-reset-confirm|revoke-session|revoke-all-sessions|profile',
            parameters: [{ name: 'action', in: 'path', required: true, schema: { type: 'string' } }],
          },
        },
        '/events': {
          get: { tags: ['events'], summary: 'Discovery list with filters', parameters: [p('q'), p('category'), p('city'), p('country'), p('mode'), p('price'), p('when'), p('from'), p('to'), p('page'), p('pageSize'), p('mine'), p('orgId')] },
          post: { tags: ['events'], summary: 'Create event (org-scoped)' },
        },
        '/events/{id}': { get: { tags: ['events'], summary: 'Event detail (slug or id)' }, patch: { tags: ['events'], summary: 'Edit event' } },
        '/events/{id}/{action}': {
          get: { tags: ['events'], summary: 'agenda|media|comments|updates|attendees|orders|invitations|stats|discount-codes' },
          post: { tags: ['events'], summary: 'transition|agenda|updates|comments|invitations|discount-codes|ticket-types' },
        },
        '/events/{id}/ticket-types/{ttId}': { patch: { tags: ['events'], summary: 'Edit ticket type' }, delete: { tags: ['events'], summary: 'Deactivate ticket type' } },
        '/discovery/{view}': { get: { tags: ['discovery'], summary: 'home|live|reels|categories|search' } },
        '/social/{action}': {
          get: { tags: ['social'], summary: 'feed|saved|following|notifications' },
          post: { tags: ['social'], summary: 'follow|unfollow|interest|reaction|report|block|mute|notifications-read' },
        },
        '/invitations/{code}': { get: { tags: ['social'], summary: 'Invitation details' }, post: { tags: ['social'], summary: 'RSVP to invitation' } },
        '/comments/{id}': { post: { tags: ['social'], summary: 'Remove own comment' } },
        '/orders': { get: { tags: ['orders'], summary: 'My orders' }, post: { tags: ['orders'], summary: 'Create order with reservations' } },
        '/orders/{ref}': { get: { tags: ['orders'], summary: 'Order detail' }, post: { tags: ['orders'], summary: 'confirm-free (free RSVP fulfilment)' } },
        '/payments/initiate': { post: { tags: ['payments'], summary: 'Create payment attempt + checkout URL' }, get: { tags: ['payments'], summary: 'Attempt status by reference' } },
        '/payments/callback': { post: { tags: ['payments'], summary: 'Hubtel v1 callback intake (durable, idempotent)' } },
        '/payments/return/{reference}': { get: { tags: ['payments'], summary: 'Browser return landing (informational only — never marks paid)' } },
        '/payments/simulator/{reference}': { get: { tags: ['payments'], summary: 'DEV SIMULATOR checkout page (blocked in production)' } },
        '/tickets': { get: { tags: ['tickets'], summary: 'My tickets' } },
        '/tickets/{id}': { get: { tags: ['tickets'], summary: 'Ticket + QR SVG' }, post: { tags: ['tickets'], summary: 'Create transfer token' } },
        '/tickets/transfer/{token}': { post: { tags: ['tickets'], summary: 'Claim transferred ticket' } },
        '/checkin/{action}': {
          get: { tags: ['checkin'], summary: 'lookup|stats|roster|device-sessions' },
          post: { tags: ['checkin'], summary: 'device-sessions|scan|sync' },
        },
        '/orgs': { get: { tags: ['orgs'], summary: 'My organizations' }, post: { tags: ['orgs'], summary: 'Create organization' } },
        '/orgs/{id}/{action}': {
          get: { tags: ['orgs'], summary: 'team|finance|payouts|messages|verification|events|subscription|overview' },
          post: { tags: ['orgs'], summary: 'team|payout-request|refund-request|verification-submit|settings|subscription-cancel' },
        },
        '/orgs/{slug}/profile': { get: { tags: ['orgs'], summary: 'Public organizer profile' } },
        '/subscriptions': { get: { tags: ['subscriptions'], summary: 'Plans' }, post: { tags: ['subscriptions'], summary: 'purchase (invoice + checkout)' } },
        '/promotions': { get: { tags: ['promotions'], summary: 'Org campaigns + metrics' }, post: { tags: ['promotions'], summary: 'Create boost campaign' } },
        '/promotions/{id}': { get: { tags: ['promotions'], summary: 'Campaign detail' }, patch: { tags: ['promotions'], summary: 'pause/resume/budget' }, post: { tags: ['promotions'], summary: 'telemetry (deduplicated)' } },
        '/broadcasts': { get: { tags: ['broadcasts'], summary: 'Live list / mine' }, post: { tags: ['broadcasts'], summary: 'Schedule broadcast' } },
        '/broadcasts/{id}/{action}': {
          get: { tags: ['broadcasts'], summary: 'chat|detail' },
          post: { tags: ['broadcasts'], summary: 'play|verify|heartbeat|chat|start|end|rotate-key' },
        },
        '/messages/{action}': {
          get: { tags: ['messaging'], summary: 'estimate|status' },
          post: { tags: ['messaging'], summary: 'send|consent' },
        },
        '/orgs/{id}/messages': { get: { tags: ['messaging'], summary: 'Org delivery log' } },
        '/notifications': { get: { tags: ['notifications'], summary: 'List + unread' }, post: { tags: ['notifications'], summary: 'Mark read' } },
        '/ai/{mode}': { post: { tags: ['ai'], summary: 'chat (text) | voice (multipart audio → transcript+reply+TTS audio)' } },
        '/effects': { get: { tags: ['effects'], summary: 'CSS effects library (filter/search)' }, post: { tags: ['effects'], summary: 'Record a view' } },
        '/uploads': { post: { tags: ['events'], summary: 'Bounded media upload' } },
        '/admin/{sections}': {
          get: { tags: ['admin'], summary: 'overview|users|orgs|events|moderation|fees|plans|payments|refunds|payouts|sms|audit|integrations|outbox|settings|categories|ledger' },
          post: { tags: ['admin'], summary: 'orgs/:id/verify|suspend, events/:id/suspend, moderation/:id/action, fees, plans, payouts/:id/approve|submit|paid|fail, refunds/:id/approve|process|reject, settings, sweeps/:kind, users/:id/suspend' },
        },
      },
    }
    return jsonOk(spec)
  })
}
