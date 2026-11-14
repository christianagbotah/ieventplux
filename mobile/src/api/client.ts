/**
 * Typed API client for the iEventPlux v1 REST surface (src/app/api/v1 on the
 * iEventPlux web deployment).
 *
 * ── Authentication adaptation (read this before touching auth code) ──────────
 * The web app authenticates with an httpOnly **cookie session** (`ievx_session`)
 * set by POST /api/v1/auth/login. There is no Bearer-token endpoint today.
 *
 * On the mobile side we adapt in two layers:
 *  1. PRIMARY (works today): React Native's fetch keeps cookies in the native
 *     cookie jar, and every request below is sent with `credentials: 'include'`
 *     so the `ievx_session` cookie flows back on subsequent calls. Sign-in state
 *     therefore survives across app restarts while the session is valid.
 *  2. FORWARD-COMPAT (inert until the server supports it): a session token can
 *     be persisted in `expo-secure-store` and replayed as
 *     `Authorization: Bearer <token>`. The login response does not currently
 *     return such a token, so the slot stays empty unless a mobile session-token
 *     endpoint is added server-side (documented in docs/NATIVE_MODULES.md).
 *
 * Errors mirror the web client's contract: non-2xx responses carry
 * `{ error: { code, message } }`; this client re-throws them as `ApiClientError`
 * with the same stable codes (UNAUTHORIZED, FORBIDDEN, CONFLICT, RATE_LIMIT, …).
 */

import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

// ─────────────────────────────────────────────────────────── shared types ───

export interface User {
  id: string
  email: string
  displayName: string
  role: string
  avatarUrl?: string | null
}

export interface Membership {
  orgId: string
  role: string
  orgName: string
  orgSlug: string
  orgStatus: string
}

export interface LoginResponse {
  user: User
  memberships: Membership[]
}

export interface MeResponse {
  user: User | null
  memberships?: Membership[]
}

export interface OrgRef {
  name: string
  slug: string
}

/** Event card as returned by GET /api/v1/discovery/home (`upcoming` / `featured`). */
export interface DiscoveryEventCard {
  id: string
  slug: string
  title: string
  summary?: string | null
  coverImageUrl?: string | null
  startsAt: string
  city?: string | null
  mode?: string | null
  categorySlug?: string | null
  org: OrgRef
  /** Present on `upcoming` items; used to derive a "from GHS x" label. */
  ticketTypes?: { priceMinor: number }[]
}

export interface DiscoveryHome {
  featured: DiscoveryEventCard[]
  upcoming: DiscoveryEventCard[]
  liveNow: {
    id: string
    slug: string
    title: string
    coverImageUrl?: string | null
    mode?: string | null
    org: { name: string }
    broadcasts: { id: string; status: string; accessPolicy: string }[]
  }[]
  categories: { id: string; slug: string; name: string }[]
  sponsored: {
    campaignId: string
    event: DiscoveryEventCard
    sponsored: boolean
  }[]
  stats: { upcomingEvents: number; organizers: number; liveNow: number }
}

export interface TicketType {
  id: string
  eventId: string
  name: string
  description?: string | null
  kind: string
  priceMinor: number
  currency: string
  quota: number
  soldCount: number
  reservedCount: number
  perBuyerLimit: number
  includesVirtualAccess: boolean
  active: boolean
  sortOrder: number
}

export interface Venue {
  id: string
  name: string
  address?: string | null
  city?: string | null
  country?: string | null
}

export interface EventDetail {
  id: string
  slug: string
  title: string
  summary?: string | null
  description: string
  coverImageUrl?: string | null
  mode: string
  status: string
  visibility: string
  city?: string | null
  country?: string | null
  timezone: string
  startsAt: string
  endsAt: string
  categorySlug: string
  org: {
    id: string
    name: string
    slug: string
    tagline?: string | null
    logoUrl?: string | null
    verifiedAt?: string | null
    orgType?: string | null
  }
  venue?: Venue | null
  ticketTypes: TicketType[]
  gallery?: { id: string; url: string; caption?: string | null }[]
  feeNote?: string | null
}

export interface EventDetailResponse {
  event: EventDetail
  stats: { followers: number; going: number; comments: number }
  mine: { saved: boolean; going: boolean; following: boolean }
  canManage: boolean
}

export interface CreateOrderPayload {
  eventId: string
  items: { ticketTypeId: string; qty: number }[]
  buyerName?: string
  buyerEmail?: string
  buyerPhone?: string
  discountCode?: string
}

/** POST /api/v1/orders — created with inventory reservations (hold window). */
export interface CreateOrderResponse {
  orderReference: string
  status: string
  totalMinor: number
  kind: 'PAID' | 'FREE'
  expiresAt?: string | null
}

export interface OrderSummary {
  id: string
  reference: string
  status: string
  kind: string
  totalMinor: number
  currency: string
  createdAt: string
  event: { title: string; slug: string; startsAt: string; coverImageUrl?: string | null; city?: string | null }
  items: { ticketType: { name: string } }[]
}

/** POST /api/v1/payments/initiate — Hubtel hosted checkout (or dev simulator). */
export interface InitiatePaymentResponse {
  attemptId: string
  checkoutUrl: string
  provider: 'HUBTEL' | 'SIMULATOR'
  existing?: boolean
  simulated?: boolean
  simulatorNotice?: string | null
  providerMode: 'simulated' | 'real'
}

export interface PaymentStatusResponse {
  attempt: {
    status: string
    provider: string
    amountMinor: number
    currency: string
    callbackCount: number
    orderId?: string | null
    invoiceId?: string | null
  } | null
  order: { status: string; reference: string } | null
}

export interface TicketSummary {
  id: string
  eventId: string
  code: string
  holderName: string
  status: string
  checkedInAt?: string | null
  event: {
    id: string
    title: string
    slug: string
    startsAt: string
    endsAt: string
    timezone: string
    venue?: { name: string; city?: string | null } | null
    org: { name: string }
  }
  ticketType: { name: string; kind: string }
}

/** GET /api/v1/tickets/{id} — adds the server-generated QR credential. */
export interface TicketDetail extends TicketSummary {
  qrPayload: string
  qrSvg: string
  seatInfo?: string | null
}

export interface TicketsPage {
  items: TicketSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface CheckinScanPayload {
  eventId: string
  payload: string
  clientScanId: string
  deviceSessionId?: string
  source?: 'ONLINE' | 'OFFLINE_SYNC'
  capturedOfflineAt?: string
}

/** Mirror of the server's ScanResult (src/server/services/checkin.ts). */
export interface ScanResult {
  result: 'ADMITTED' | 'DUPLICATE' | 'INVALID' | 'CONFLICT'
  ticket?: {
    code: string
    holderName: string
    ticketType: string
    checkedInAt: string | null
  }
  detail: string
}

export interface CheckinSyncResponse {
  synced: number
  results: ScanResult[]
}

/** GET /api/v1/checkin/roster — minimized offline roster (id/code/name/status only). */
export interface CheckinRosterResponse {
  event: { id: string; title?: string | null; startsAt?: string | null }
  rosterVersion: string
  count: number
  tickets: { id: string; code: string; holderName: string; status: string }[]
  note: string
}

// ─────────────────────────────────────────────── broadcasts (live + replay) ──

export interface BroadcastDetail {
  id: string
  eventId: string
  status: string // SCHEDULED | LIVE | ENDED | FAILED
  title: string
  accessPolicy: string // FREE | PAID | TICKET_HOLDERS | INVITE_ONLY
  priceMinor: number | null
  replayPriceMinor: number | null
  viewerCapacity: number
  viewerCount: number
  recordingStatus: string | null
  startedAt?: string | null
  endedAt?: string | null
  scheduledFor?: string | null
  event: {
    id: string
    title: string
    slug: string
    startsAt: string
    endsAt: string
    coverImageUrl?: string | null
    org: { name: string; slug: string }
  }
}

export interface BroadcastDetailResponse {
  broadcast: BroadcastDetail
  access: { allowed: boolean; reason?: string; requires?: string }
  replay: { available: boolean; effectivePriceMinor: number | null }
  delivery: 'SYNTHETIC' | 'CLOUDFLARE_STREAM'
  deliveryNote: string
}

/** POST /broadcasts/{id}/play — entitlement-gated playback session. */
export interface PlaybackIssueResponse {
  playbackToken: string
  expiresAt: string
  mode: 'LIVE' | 'REPLAY'
  delivery: 'SYNTHETIC' | 'CLOUDFLARE_STREAM'
  deliveryNote: string
}

export interface BroadcastChatMessage {
  id: string
  body: string
  createdAt: string
  user: { id: string; displayName: string }
}

export interface BroadcastChatPage {
  items: BroadcastChatMessage[]
  total: number
  page: number
  pageSize: number
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  readAt?: string | null
  createdAt: string
}

export interface NotificationsResponse {
  items: NotificationItem[]
  unread: number
  page?: number
  pageSize?: number
}

// ──────────────────────────────────────────────────────────── error type ───

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

// ───────────────────────────────────────────────── base URL resolution ─────

/**
 * Resolution order:
 *  1. `EXPO_PUBLIC_API_BASE_URL` env var (inlined at bundle time by Expo).
 *  2. `app.json` → `expo.extra.apiBaseUrl` (read via expo-constants).
 * The shipped value in app.json is an intentional placeholder — until it is
 * replaced with a real http(s) URL of the iEventPlux web deployment the client
 * reports `BASE_URL_NOT_CONFIGURED` instead of silently calling localhost.
 */
function resolveBaseUrl(): string | null {
  const fromEnv: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL
  const extra: Record<string, unknown> | undefined = (
    Constants.expoConfig as { extra?: Record<string, unknown> } | null
  )?.extra
  const fromConfig: string | undefined =
    typeof extra?.apiBaseUrl === 'string' ? extra.apiBaseUrl : undefined
  const candidate: string | undefined = fromEnv ?? fromConfig
  if (!candidate || !/^https?:\/\//i.test(candidate)) return null
  return candidate.replace(/\/+$/, '')
}

export function isBaseUrlConfigured(): boolean {
  return resolveBaseUrl() !== null
}

/** Resolve a possibly-relative server path (e.g. the dev payment simulator's
 *  `/api/v1/payments/simulator/{ref}` checkout URL) against the configured base. */
export function absoluteUrl(pathOrUrl: string): string | null {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = resolveBaseUrl()
  if (!base) return null
  return `${base}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

// ────────────────────────────────────── session token (see header notes) ───

const SESSION_TOKEN_KEY = 'ieventplux.mobile.sessionToken'

export async function getStoredSessionToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY)
  } catch {
    // SecureStore can be unavailable on unsupported targets (e.g. web preview).
    return null
  }
}

export async function storeSessionToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token)
    else await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY)
  } catch {
    // Non-fatal: cookie-jar auth (layer 1) still applies.
  }
}

// ─────────────────────────────────────────────────────── request plumbing ──

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const base = resolveBaseUrl()
  if (!base) {
    throw new ApiClientError(
      'BASE_URL_NOT_CONFIGURED',
      'API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL (or app.json expo.extra.apiBaseUrl) to your iEventPlux web deployment.',
      0
    )
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  // Forward-compat Bearer layer — empty today (see file header).
  const token = await getStoredSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Cookie-jar layer: React Native persists Set-Cookie (ievx_session)
      // natively; 'include' makes the intent explicit for typed RequestInit.
      credentials: 'include',
    })
  } catch (err) {
    throw new ApiClientError(
      'NETWORK',
      err instanceof Error ? err.message : 'Network request failed. Check connectivity and the API base URL.',
      0
    )
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiClientError(
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? `Request failed (${res.status}).`,
      res.status
    )
  }
  return data as T
}

// ────────────────────────────────────────────────── endpoint surface used ──

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<LoginResponse>('POST', '/auth/login', { email, password }),
    requestReset: (email: string) =>
      request<{ devResetCode?: string | null }>('POST', '/auth/password-reset', { email }),
    confirmReset: (email: string, code: string, password: string) =>
      request<{ message?: string }>('POST', '/auth/password-reset-confirm', { email, code, password }),
    me: () => request<MeResponse>('GET', '/auth/me'),
    logout: () => request<{ ok: boolean }>('POST', '/auth/logout'),
  },
  discovery: {
    home: () => request<DiscoveryHome>('GET', '/discovery/home'),
  },
  events: {
    /** `idOrSlug` — the server accepts the event slug or the internal id. */
    get: (idOrSlug: string) =>
      request<EventDetailResponse>('GET', `/events/${encodeURIComponent(idOrSlug)}`),
  },
  orders: {
    create: (payload: CreateOrderPayload) => request<CreateOrderResponse>('POST', '/orders', payload),
    list: () => request<{ items: OrderSummary[] }>('GET', '/orders'),
  },
  payments: {
    initiate: (orderReference: string) =>
      request<InitiatePaymentResponse>('POST', '/payments/initiate', { orderReference }),
    status: (reference: string) =>
      request<PaymentStatusResponse>('GET', `/payments/initiate?reference=${encodeURIComponent(reference)}`),
  },
  tickets: {
    list: () => request<TicketsPage>('GET', '/tickets'),
    get: (id: string) => request<{ ticket: TicketDetail }>('GET', `/tickets/${encodeURIComponent(id)}`),
  },
  checkin: {
    /** Online scan — `clientScanId` is an idempotency key (server dedups it). */
    scan: (payload: CheckinScanPayload) => request<ScanResult>('POST', '/checkin/scan', payload),
    /** Offline batch replay — conflicts are preserved as CONFLICT results. */
    sync: (payload: { eventId: string; deviceSessionId?: string; scans: { payload: string; clientScanId: string; capturedOfflineAt?: string }[] }) =>
      request<CheckinSyncResponse>('POST', '/checkin/sync', payload),
    /** Minimized offline roster (staff-gated server-side). */
    roster: (eventId: string) =>
      request<CheckinRosterResponse>('GET', `/checkin/roster?eventId=${encodeURIComponent(eventId)}`),
  },
  broadcasts: {
    /** Detail + viewer access verdict + replay surface + delivery mode. */
    detail: (id: string) => request<BroadcastDetailResponse>('GET', `/broadcasts/${encodeURIComponent(id)}/detail`),
    /** Entitlement check → short-lived playback token (10 min; live or replay). */
    play: (id: string) => request<PlaybackIssueResponse>('POST', `/broadcasts/${encodeURIComponent(id)}/play`, {}),
    /** Keep the playback session alive (server revokes stale sessions). */
    heartbeat: (id: string, token: string) =>
      request<{ alive: boolean; expiresAt?: string | null }>('POST', `/broadcasts/${encodeURIComponent(id)}/heartbeat`, { token }),
    /** Chat history — viewers read VISIBLE only (server-filtered). */
    chat: (id: string) => request<BroadcastChatPage>('GET', `/broadcasts/${encodeURIComponent(id)}/chat`),
    /** Send a chat message (LIVE broadcasts only, server-enforced). */
    chatSend: (id: string, body: string) =>
      request<{ message: BroadcastChatMessage }>('POST', `/broadcasts/${encodeURIComponent(id)}/chat`, { body }),
  },
  notifications: {
    list: () => request<NotificationsResponse>('GET', '/notifications'),
  },
}

// ───────────────────────────────────── shared formatting helpers (GHS) ──────

export function formatMinor(minor: number, currency = 'GHS'): string {
  return `${currency} ${(minor / 100).toFixed(2)}`
}

export function minPriceLabel(priceMinors: number[]): string {
  if (priceMinors.length === 0) return 'Ticketing TBA'
  const min = Math.min(...priceMinors)
  return min === 0 ? 'Free' : `from ${formatMinor(min)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Deterministic date label (locale-independent so it renders identically on every device). */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? '?'} ${d.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${formatDate(iso)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
