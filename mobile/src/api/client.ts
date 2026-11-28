import type {PurchaseRequestHistory,PurchaseRequestResponse,purchaseRequestBody,RequestDecision,PurchaseRequestRow} from '../lib/marketplace-requests'
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
  emailVerifiedAt?: string | null
  displayName: string
  role: string
  avatarUrl?: string | null
  bannerUrl?:string|null
  bio?:string|null
  city?:string|null
  phone?:string|null
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
  ticketTypes?: { priceMinor: number;currency?:string }[]
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

/** Shared server-backed social surfaces: never invent reels, events or feed posts. */
export interface NativeFollowingPage {
  items: {
    id: string
    kind: 'EVENT' | 'UPDATE'
    activityAt: string
    title: string
    body: string | null
    important: boolean
    event: DiscoveryEventCard
  }[]
  nextCursor: string | null
  hasMore: boolean
  followingCount: number
}

export interface NativeEventClip {
  id: string
  url: string
  posterUrl: string
  caption?: string | null
  durationSec?: number | null
  event: { id: string; title: string; slug: string; startsAt: string; org: { name: string } }
  nextEvent: { id: string; title: string; slug: string } | null
  org: { name: string; slug: string }
  views: number
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

/** Event community returns only author display identities, not attendee rosters. */
export interface CompetitionNomineeView {
  id: string
  name: string
  bio: string | null
  photoUrl: string | null
  votes: number | null
}
export interface CompetitionCategoryView {
  id: string
  title: string
  myNomineeId: string | null
  totalVotes: number | null
  nominees: CompetitionNomineeView[]
}
export interface EventCompetitionView {
  id: string
  eventId: string
  title: string
  description: string | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  votingMethod: 'FREE'
  votingStartsAt: string
  votingEndsAt: string
  canVote: boolean
  countsVisible: boolean
  totalVotes: number | null
  categories: CompetitionCategoryView[]
}

export interface NativeMarketplaceStore {
  id: string
  slug: string
  name: string
  tagline: string | null
  category: string
  logoUrl: string | null
  coverUrl: string | null
  country: string
  city: string | null
  verificationState: string
  productCount: number
  status?:string
}
export interface NativeMarketplaceVariant {
  id: string
  sku: string
  title: string
  priceMinor: number
  currency: string
  available: number
  active: boolean
}
export interface NativeMarketplaceProduct {
  status: string
  id: string
  name: string
  description: string
  shortDesc: string | null
  brand: string | null
  category: string
  images: string[]
  specifications: Record<string,string>
  variants: NativeMarketplaceVariant[]
}
export interface NativeMarketplaceQuote {
  storeSlug: string
  quotedAt: string
  currency: string
  unitCount: number
  totalMinor: number
  checkoutEnabled: false
  inventoryReserved: false
  notice: string
  items: Array<{variantId:string;sku:string;variantTitle:string;productName:string;quantity:number;
    unitPriceMinor:number;lineMinor:number;available:number;currency:string}>
}
export interface NativeStoreDetail {
  store: NativeMarketplaceStore & { description: string | null; status: string }
  products: NativeMarketplaceProduct[]
  canManage: boolean
  checkoutEnabled: boolean
}

export interface CommunityComment {
  id: string
  eventId: string
  userId: string
  parentId: string | null
  body: string
  createdAt: string
  user: { id: string; displayName: string; avatarUrl?: string | null }
  children?: CommunityComment[]
  _count?: { children: number }
}
export interface CommunityThreadPage {
  items: CommunityComment[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
export interface NetworkMember {
  id: string
  displayName: string
  avatarUrl?: string | null
  following: boolean
  isMe: boolean
}
export interface EventNetworkResponse {
  eligible: boolean
  optedIn: boolean
  items: NetworkMember[]
  hasMore: boolean
  nextCursor: string | null
}

export interface Venue {
  id: string
  name: string
  address?: string | null
  city?: string | null
  country?: string | null
}

/** Public event programme fields delivered by GET /events/{id}; only published
 * lineup, active souvenirs and approved-visible documents arrive from the API. */
export interface EventContributor {
  id: string
  name: string
  role: string
  topic?: string | null
  bio?: string | null
  photoUrl?: string | null
  startsAt?: string | null
}
export interface EventAgendaItem {
  id: string
  title: string
  startsAt: string
  endsAt?: string | null
  speaker?: string | null
  description?: string | null
}
export interface EventSouvenir {
  id: string
  name: string
  variantLabel?: string | null
  sku: string
  priceMinor: number
  imageUrl?: string | null
  description?: string | null
  available: number
  onlineOrderingEnabled: boolean
}
export interface EventProgrammeFile {
  id: string
  title: string
  downloadUrl: string
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
  venue?: (Venue & { mapsUrl?: string | null; accessibilityInfo?: string | null }) | null
  directionsUrl?: string | null
  accessibilityInfo?: string | null
  attendanceRules?: string | null
  ageGuidance?: string | null
  refundPolicy?: string | null
  agenda?: EventAgendaItem[]
  contributors?: EventContributor[]
  programmes?: EventProgrammeFile[]
  souvenirs?: EventSouvenir[]
  updates?: { id: string; title: string; body: string; important: boolean; createdAt: string }[]
  ticketTypes: TicketType[]
  gallery?: { id: string; url: string; caption?: string | null }[]
  feeNote?: string | null
}

export type AudiencePollOption={id:string;text:string;position:number;votes:number}
export type AudiencePoll={id:string;eventId:string;question:string;status:'DRAFT'|'OPEN'|'CLOSED';totalVotes:number;myOptionId:string|null;options:AudiencePollOption[]}
export type AudienceQuestion={id:string;body:string;status:'NEW'|'ANSWERED'|'HIDDEN';answer:string|null;pinned:boolean;author:{id:string;displayName:string};upvotes:number;myUpvote:boolean;isMine:boolean}

export interface EventReminderState { active: boolean; holdingTicket: boolean; upcoming: boolean }
export interface EventWaitlistState {
  count: number
  mine: null | { position: number; status: string; partySize: number; notifiedAt: string | null }
}
export interface EventDetailResponse {
  event: EventDetail
  stats: { followers: number; going: number; comments: number }
  mine: { saved: boolean; going: boolean; following: boolean }
  canManage: boolean
}

export interface OrganizerEventCard extends DiscoveryEventCard {
  status: string
  visibility: string
  publishAt?: string | null
  timezone: string
  country: string
  org: OrgRef & { id: string }
}
export interface OrganizerEventPage {
  items: OrganizerEventCard[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
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
  hasMore?: boolean
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
  body?: unknown,
  signal?:AbortSignal
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
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'

  // Forward-compat Bearer layer — empty today (see file header).
  const token = await getStoredSessionToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body as FormData : JSON.stringify(body),
      // Cookie-jar layer: React Native persists Set-Cookie (ievx_session)
      // natively; 'include' makes the intent explicit for typed RequestInit.
      credentials: 'include',
      signal,
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

export type PushDevice={id:string;platform:string;lastUpdatedAt:string;leaseUntil:string|null;currentSession:boolean;registrationCurrent:boolean}
export type DirectCall={id:string;conversationId:string;callerId:string;callerName?:string|null;calleeId:string;kind:'VOICE'|'VIDEO';status:string;createdAt:string;expiresAt:string;thisDevice:boolean;mediaConnected:boolean}
export type DirectContact={id:string;displayName:string;avatarUrl:string|null}
export type DirectConversation={id:string;status:string;requesterId:string;updatedAt?:string;peer:DirectContact|null;unread?:number;canSend?:boolean;blockedByMe?:boolean;mutedByMe?:boolean}
export type DirectAttachment={filename:string;mime:string;size:number}
export type DirectMessage={id:string;senderId:string;body:string;createdAt:string;readAt:string|null;removedAt?:string|null;attachment?:DirectAttachment|null}
export type DirectDetail={conversation:DirectConversation;items:DirectMessage[];nextCursor:string|null}
export type SouvenirRequestItem={id:string;productName:string;productSku:string;quantity:number;totalMinor:number;status:string}
export type ServiceProviderCategory={id:string;division:string;regulated:boolean}
export type PublicServiceProvider={id:string;displayName:string;category:string;community:string;availability:string;lastConfirmedAt:string|null}
export type OwnedServiceProvider={id:string;displayName:string;category:string;community:string;reviewStatus:string;published:boolean;availabilityState:string;availableUntil:string|null}
export type ServiceEnquiry={id:string;providerId:string;description:string;community:string;status:string;quoteMinor:number|null;quoteNote:string|null;quoteExpiresAt:string|null;role:'CUSTOMER'|'PROVIDER';provider:{displayName:string;category:string};customer:{displayName:string}}
export type ServiceAppointment={id:string;enquiryId:string;startsAt:string;endsAt:string;status:string;role:'CUSTOMER'|'PROVIDER';provider:{displayName:string};customer:{displayName:string}}
export type ServiceArea={id:string;name:string;region:string}
export type ServiceAreaConsent={consentedAt:string;revokedAt:string|null;area:ServiceArea&{active:boolean}}
export type NearbyServiceProvider=PublicServiceProvider&{region:string;proximity:string}
export type ProviderCredentialSummary={id:string;kind:string;reviewStatus:string;uploadedAt:string}
export type FleetVehicle={id:string;label:string;vehicleClass:string;passengerSeats:number;state:string;stationArea:ServiceArea|null}
export type FleetClass={id:string;min:number;max:number}
export type DriverAssignment={id:string;state:string;expiresAt:string;isExpired:boolean;role:'OWNER'|'DRIVER';vehicle:{label:string;vehicleClass:string;providerName:string};driver:{displayName:string}|null}
export type CharterPlan={id:string;title:string;origin:ServiceArea;destination:ServiceArea;departureAt:string;returnAt:string|null;passengers:number;state:string;capacityEstimate:{illustrativeSeats:number;vehicles:number}[]}
export type CharterDraft={title:string;originAreaId:string;destinationAreaId:string;departureAt:string;returnAt:string|null;passengers:number;requestKey:string}
export type TransportRouteDraft={id:string;label:string;origin:ServiceArea;destination:ServiceArea;departureMinute:number;operatingDays:number[];estimatedMinutes:number;state:string}
export type DepartureDraft={id:string;state:string;departureAt:string;arrivalAt:string;allocatedSeats:number;route:{label:string};vehicle:{label:string;passengerSeats:number}}
export const api = {
  transportDepartures:{
    list:(id:string)=>request<{items:DepartureDraft[]}>('GET','/service-providers/'+encodeURIComponent(id)+'/departures'),
    create:(id:string,body:{routeId:string;vehicleId:string;date:string;allocatedSeats:number})=>request<{item:DepartureDraft}>('POST','/service-providers/'+encodeURIComponent(id)+'/departures',body),
    cancel:(id:string,departureId:string)=>request<{state:string}>('PATCH','/service-providers/'+encodeURIComponent(id)+'/departures/'+encodeURIComponent(departureId),{action:'CANCEL'}),
  },
  transportRoutes:{
    list:(id:string)=>request<{items:TransportRouteDraft[]}>('GET','/service-providers/'+encodeURIComponent(id)+'/transport-routes'),
    create:(id:string,body:{label:string;originAreaId:string;destinationAreaId:string;departureTime:string;operatingDays:number[];estimatedMinutes:number})=>request<{item:TransportRouteDraft}>('POST','/service-providers/'+encodeURIComponent(id)+'/transport-routes',body),
    archive:(id:string,routeId:string)=>request<{state:string}>('PATCH','/service-providers/'+encodeURIComponent(id)+'/transport-routes/'+encodeURIComponent(routeId),{action:'ARCHIVE'}),
  },
  charterPlans:{
    list:()=>request<{items:CharterPlan[]}>('GET','/transport-charter-plans'),
    create:(body:CharterDraft)=>request<{item:CharterPlan}>('POST','/transport-charter-plans',body),
    cancel:(id:string)=>request<{state:string}>('PATCH','/transport-charter-plans/'+encodeURIComponent(id),{action:'CANCEL'}),
  },

  driverAssignments:{
    list:()=>request<{items:DriverAssignment[]}>('GET','/transport-driver-assignments'),
    invite:(providerId:string,vehicleId:string)=>request<{token:string;item:{expiresAt:string}}>('POST','/service-providers/'+encodeURIComponent(providerId)+'/vehicles/'+encodeURIComponent(vehicleId)+'/driver-invitation',{}),
    accept:(token:string)=>request<{item:{id:string;state:string}}>('POST','/transport-driver-assignments',{token,consent:true}),
    end:(id:string)=>request<{state:string}>('PATCH','/transport-driver-assignments/'+encodeURIComponent(id),{action:'END'}),
  },
  transportFleet:{
    list:(id:string)=>request<{items:FleetVehicle[];classes:FleetClass[]}>('GET','/service-providers/'+encodeURIComponent(id)+'/vehicles'),
    create:(id:string,body:{label:string;vehicleClass:string;passengerSeats:number;stationAreaId:string|null})=>request<{item:FleetVehicle}>('POST','/service-providers/'+encodeURIComponent(id)+'/vehicles',body),
    archive:(id:string,vehicleId:string)=>request<{state:string}>('PATCH','/service-providers/'+encodeURIComponent(id)+'/vehicles/'+encodeURIComponent(vehicleId),{action:'ARCHIVE'}),
  },
  providerCredentials:{
    list:(providerId:string)=>request<{items:ProviderCredentialSummary[];intakeEnabled:boolean;certificationEnabled:boolean}>('GET','/service-providers/'+encodeURIComponent(providerId)+'/credentials'),
    withdraw:(providerId:string,documentId:string)=>request<{removed:boolean}>('DELETE','/service-providers/'+encodeURIComponent(providerId)+'/credentials/'+encodeURIComponent(documentId)),
  },
  serviceAreas:{
    list:(region:string,q:string)=>request<{items:ServiceArea[];regions:string[]}>('GET','/service-areas?region='+encodeURIComponent(region)+'&q='+encodeURIComponent(q)),
    nearby:(areaId:string,category:string)=>request<{items:NearbyServiceProvider[]}>('GET','/service-providers/nearby?areaId='+encodeURIComponent(areaId)+'&category='+encodeURIComponent(category)),
    consent:(id:string)=>request<{consent:ServiceAreaConsent|null}>('GET','/service-providers/'+encodeURIComponent(id)+'/area'),
    save:(id:string,areaId:string)=>request<{consent:ServiceAreaConsent}>('POST','/service-providers/'+encodeURIComponent(id)+'/area',{areaId,consent:true}),
    revoke:(id:string)=>request<{revoked:boolean}>('DELETE','/service-providers/'+encodeURIComponent(id)+'/area'),
  },
  serviceAppointments:{
    list:()=>request<{items:ServiceAppointment[]}>('GET','/service-appointments'),
    create:(body:{enquiryId:string;startsAt:string;durationMinutes:number})=>request<{item:{id:string;status:string}}>('POST','/service-appointments',body),
    decide:(id:string,action:string)=>request<{item:{id:string;status:string}}>('PATCH','/service-appointments/'+encodeURIComponent(id),{action}),
  },
  serviceEnquiries:{
    list:()=>request<{items:ServiceEnquiry[]}>('GET','/service-enquiries'),
    create:(body:{providerId:string;requestKey:string;description:string;community:string})=>request<{id:string;status:string}>('POST','/service-enquiries',body),
    decide:(id:string,body:{action:string;quoteMinor?:number;quoteNote?:string})=>request<{item:{id:string;status:string}}>('PATCH','/service-enquiries/'+encodeURIComponent(id),body),
  },
  serviceProviders: {
    discover:(category:string,community:string)=>request<{items:PublicServiceProvider[];categories:ServiceProviderCategory[]}>('GET','/service-providers/discover?country=GH&category='+encodeURIComponent(category)+'&community='+encodeURIComponent(community)),
    mine:()=>request<{items:OwnedServiceProvider[]}>('GET','/service-providers'),
    enroll:(body:{category:string;country:string;community:string;displayName:string;serviceDescription:string})=>request<{item:OwnedServiceProvider}>('POST','/service-providers',body),
    action:(id:string,action:string)=>request<{item:OwnedServiceProvider}>('PATCH','/service-providers/'+encodeURIComponent(id),{action}),
  },
  souvenirs: {
    requests:(eventId:string)=>request<{items:SouvenirRequestItem[];manager:boolean}>('GET','/events/'+encodeURIComponent(eventId)+'/souvenir-requests'),
    create:(eventId:string,body:{productId:string;quantity:number;expectedUnitPriceMinor:number;requestKey:string})=>request<{request:SouvenirRequestItem}>('POST','/events/'+encodeURIComponent(eventId)+'/souvenir-requests',body),
    decide:(eventId:string,id:string,status:string)=>request<{status:string}>('PATCH','/events/'+encodeURIComponent(eventId)+'/souvenir-requests/'+encodeURIComponent(id),{status}),
  },
  auth: {
    updateProfile:(body:{expectedUserId:string;displayName:string;city:string;bio:string})=>request<{ok:boolean}>('POST','/auth/profile',body),
    uploadProfileImage:(body:FormData)=>request<{url:string}>('POST','/auth/branding',body),
    register:(body:{displayName:string;email:string;password:string})=>request<{user:User;verificationEmailAvailable:boolean}>('POST','/auth/register',body),
    login: (email: string, password: string) =>
      request<LoginResponse>('POST', '/auth/login', { email, password }),
    requestReset: (email: string) =>
      request<{ devResetCode?: string | null }>('POST', '/auth/password-reset', { email }),
    confirmReset: (email: string, code: string, password: string) =>
      request<{ message?: string }>('POST', '/auth/password-reset-confirm', { email, code, password }),
    resendVerification: () => request<{queued: boolean; alreadyVerified?: boolean; devVerificationCode?: string | null}>('POST', '/auth/resend-code', {}),
    verifyEmail: (code: string) => request<{verified: boolean}>('POST', '/auth/verify-contact', { channel: 'EMAIL', code }),
    me: () => request<MeResponse>('GET', '/auth/me'),
    logout: () => request<{ ok: boolean }>('POST', '/auth/logout'),
  },
  discovery: {
    home: () => request<DiscoveryHome>('GET', '/discovery/home'),
    /** The same public, real-catalogue event previews as the web Reels feed. */
    reels: () => request<{ clips: NativeEventClip[] }>('GET', '/discovery/reels'),
    locations: () => request<{ countries: { code: string; count: number }[] }>('GET', '/discovery/locations'),
    searchEvents: (query: string, category: string) => {
      const params = new URLSearchParams({ page: '1', pageSize: '36' })
      if (query.trim()) params.set('q', query.trim())
      if (category !== 'all') params.set('category', category)
      return request<{ items: DiscoveryEventCard[]; total: number }>('GET', `/events?${params.toString()}`)
    },
    filterEvents: (queryString: string) => request<{ items: DiscoveryEventCard[]; total: number }>('GET', '/events?' + queryString),
  },
  events: {
    /** `idOrSlug` — the server accepts the event slug or the internal id. */
    get: (idOrSlug: string) =>
      request<EventDetailResponse>('GET', `/events/${encodeURIComponent(idOrSlug)}`),
    reminder: (id: string) => request<EventReminderState>('GET', '/events/'+encodeURIComponent(id)+'/reminder'),
    setReminder: (id: string, active: boolean) => request<{active:boolean}>('POST', '/events/'+encodeURIComponent(id)+(active?'/reminder':'/reminder-cancel'), {}),
    waitlist: (id: string) => request<EventWaitlistState>('GET', '/events/'+encodeURIComponent(id)+'/waitlist'),
    joinWaitlist: (id: string, body: {name:string;contact:string;partySize:number}) => request<{position:number;reactivated:boolean;status:string}>('POST','/events/'+encodeURIComponent(id)+'/waitlist',body),
    leaveWaitlist: (id: string) => request<{left:boolean}>('POST','/events/'+encodeURIComponent(id)+'/waitlist-leave',{}),
  },
  engagement: {
    polls:(eventId:string,signal?:AbortSignal)=>request<{polls:AudiencePoll[];isOrg:boolean}>('GET','/events/'+encodeURIComponent(eventId)+'/polls',undefined,signal),
    questions:(eventId:string,signal?:AbortSignal)=>request<{questions:AudienceQuestion[];isOrg:boolean}>('GET','/events/'+encodeURIComponent(eventId)+'/questions',undefined,signal),
    vote:(pollId:string,optionId:string)=>request<{myOptionId:string}>('POST','/polls/'+encodeURIComponent(pollId)+'/vote',{optionId}),
    createPoll:(eventId:string,question:string,options:string[])=>request<{poll:AudiencePoll}>('POST','/events/'+encodeURIComponent(eventId)+'/polls',{question,options}),
    pollStatus:(pollId:string,action:'open'|'close')=>request<{poll:AudiencePoll}>('POST','/polls/'+encodeURIComponent(pollId)+'/'+action,{}),
    ask:(eventId:string,body:string)=>request<{question:AudienceQuestion}>('POST','/events/'+encodeURIComponent(eventId)+'/questions',{body}),
    questionAction:(id:string,action:'upvote'|'answer'|'hide'|'unhide'|'pin'|'unpin',answer?:string)=>request<unknown>('POST','/questions/'+encodeURIComponent(id)+'/'+action,answer===undefined?{}:{answer}),
  },
  organizer: {
    agenda:(id:string)=>request<{items:(EventAgendaItem&{sortOrder:number})[]}>('GET','/events/'+encodeURIComponent(id)+'/agenda'),
    saveAgenda:(id:string,itemId:string|null,body:unknown)=>request<unknown>(itemId?'PATCH':'POST','/events/'+encodeURIComponent(id)+'/agenda'+(itemId?'/'+encodeURIComponent(itemId):''),body),
    removeAgenda:(id:string,itemId:string)=>request<unknown>('DELETE','/events/'+encodeURIComponent(id)+'/agenda/'+encodeURIComponent(itemId)),
    contributors:(id:string)=>request<{items:(EventContributor&{endsAt:string|null;sortOrder:number;published:boolean})[]}>('GET','/events/'+encodeURIComponent(id)+'/contributors'),
    saveContributor:(id:string,itemId:string|null,body:unknown)=>request<unknown>(itemId?'PATCH':'POST','/events/'+encodeURIComponent(id)+'/contributors'+(itemId?'/'+encodeURIComponent(itemId):''),body),
    removeContributor:(id:string,itemId:string)=>request<unknown>('DELETE','/events/'+encodeURIComponent(id)+'/contributors/'+encodeURIComponent(itemId)),
    archiveProgramme:(id:string,assetId:string)=>request<unknown>('DELETE','/events/'+encodeURIComponent(id)+'/programmes/'+encodeURIComponent(assetId)),
    profile:(slug:string)=>request<{org:{id:string;slug:string;name:string;tagline:string|null;description:string|null;city:string|null;logoUrl:string|null;coverUrl:string|null;verified:boolean};canEdit:boolean}>('GET','/orgs/'+encodeURIComponent(slug)+'/profile'),
    updateProfile:(slug:string,body:unknown)=>request<{ok:boolean}>('PATCH','/orgs/'+encodeURIComponent(slug)+'/profile',body),
    uploadBranding:(id:string,body:FormData)=>request<{url:string}>('POST','/orgs/'+encodeURIComponent(id)+'/branding',body),
    uploadEventArtwork:(body:FormData)=>request<{asset:{url:string;id:string}}>('POST','/uploads',body),
    eventStats:(id:string)=>request<{paidOrders:number;freeOrders:number;ticketsSold:number;checkedIn:number;grossMinor:number;feesMinor:number;netMinor:number}>('GET','/events/'+encodeURIComponent(id)+'/stats'),
    eventOrders:(id:string,page:number)=>request<{items:{id:string;reference:string;buyerName:string;totalMinor:number;currency:string;status:string;createdAt:string}[];total:number}>('GET','/events/'+encodeURIComponent(id)+'/orders?page='+page+'&pageSize=25'),
    eventAttendees:(id:string,page:number)=>request<{items:{id:string;code:string;holderName:string;ticketType:string;status:string;checkedInAt:string|null}[];total:number}>('GET','/events/'+encodeURIComponent(id)+'/attendees?page='+page+'&pageSize=25'),
    createTicketType:(id:string,body:unknown)=>request<{ticketType:TicketType}>('POST','/events/'+encodeURIComponent(id)+'/ticket-types',body),
    publishEvent:(id:string)=>request<unknown>('POST','/events/'+encodeURIComponent(id)+'/transition',{to:'PUBLISHED'}),
    memberships: () => request<{ items: Membership[] }>('GET','/orgs'),
    createOrganization: (payload: unknown) => request<{org:{id:string;name:string;status:string};note:string}>(
      'POST','/orgs',payload,
    ),
    events: (orgId: string, page=1) => request<OrganizerEventPage>(
      'GET', '/events?mine=1&orgId='+encodeURIComponent(orgId)+'&page='+page+'&pageSize=20',
    ),
    createDraft: (payload: unknown) => request<{ event: {id:string;slug:string;title:string;status:string};occurrencesCreated:number;seriesId:string|null }>(
      'POST','/events',payload,
    ),
    editDetails: (id:string,payload:unknown) => request<{event: {id:string;title:string}}>(
      'PATCH','/events/'+encodeURIComponent(id),payload,
    ),
  },
  marketplace: {
    paymentSettings:(slug:string)=>request<NativeSellerPaymentSettings>('GET','/marketplace/stores/'+encodeURIComponent(slug)+'/payment-settings'),
    savePaymentSettings:(slug:string,body:NativeSellerPaymentPreferences)=>request<NativeSellerPaymentSettings>('PATCH','/marketplace/stores/'+encodeURIComponent(slug)+'/payment-settings',body),
    requestSettlement:(slug:string)=>request<{settlementStatus:string;checkoutEnabled:false}>('POST','/marketplace/stores/'+encodeURIComponent(slug)+'/settlement-onboarding',{}),
    uploadImage:(slug:string,body:FormData)=>request<{url:string}>('POST','/marketplace/stores/'+encodeURIComponent(slug)+'/images',body),
    myStores:()=>request<{stores:NativeMarketplaceStore[]}>('GET','/marketplace/stores?mine=1'),
    createStore:(body:unknown)=>request<{store:{id:string;slug:string;name:string;status:string}}>('POST','/marketplace/stores',body),
    updateStore:(slug:string,body:unknown)=>request<{store:{id:string;slug:string;status:string}}>('PATCH','/marketplace/stores/'+encodeURIComponent(slug),body),
    createProduct:(slug:string,body:unknown)=>request<{product:{id:string;slug:string;name:string;status:string}}>('POST','/marketplace/stores/'+encodeURIComponent(slug)+'/products',body),
    publishProduct:(id:string,status:'ACTIVE'|'DRAFT'|'ARCHIVED')=>request<unknown>('PATCH','/marketplace/products/'+encodeURIComponent(id),{status}),
    adjustStock:(id:string,body:{delta:number;reason:string;requestKey:string})=>request<unknown>('POST','/marketplace/variants/'+encodeURIComponent(id)+'/stock',body),
    stores: (q = '') => request<{ stores: NativeMarketplaceStore[]; checkoutEnabled: false }>(
      'GET', '/marketplace/stores' + (q ? '?q=' + encodeURIComponent(q) : ''),
    ),
    store: (slug: string) => request<NativeStoreDetail>(
      'GET', '/marketplace/stores/' + encodeURIComponent(slug),
    ),
    decidePurchaseRequest: (id:string,status:RequestDecision) => request<{request:PurchaseRequestRow;checkoutEnabled:false;inventoryReserved:false}>('PATCH','/marketplace/requests/'+encodeURIComponent(id),{status}),
    checkoutReview:(id:string)=>request<import('../lib/marketplace-requests').CheckoutReview>('GET','/marketplace/requests/'+encodeURIComponent(id)+'/checkout-review'),
    preparePurchaseCheckout:(id:string,totalMinor:number)=>request<{checkoutEnabled:false;paymentCollected:false}>('POST','/marketplace/requests/'+encodeURIComponent(id)+'/checkout-draft',{expectedTotalMinor:totalMinor}),
    reservePurchaseStock:(id:string)=>request<unknown>('POST','/marketplace/requests/'+encodeURIComponent(id)+'/hold',{}),
    releasePurchaseStock:(id:string)=>request<unknown>('DELETE','/marketplace/requests/'+encodeURIComponent(id)+'/hold'),
    purchaseRequests: (slug:string) => request<PurchaseRequestHistory>('GET','/marketplace/stores/'+encodeURIComponent(slug)+'/requests'),
    createPurchaseRequest: (slug:string,body:ReturnType<typeof purchaseRequestBody>) => request<PurchaseRequestResponse>('POST','/marketplace/stores/'+encodeURIComponent(slug)+'/requests',body),
    changePrice: (id:string,priceMinor:number,expectedPriceMinor:number) => request<{variant:{id:string;priceMinor:number}}>(
      'PATCH','/marketplace/variants/'+encodeURIComponent(id)+'/price',{priceMinor,expectedPriceMinor},
    ),
    quote: (slug: string, items: Array<{variantId:string;quantity:number}>) => request<NativeMarketplaceQuote>(
      'POST','/marketplace/stores/' + encodeURIComponent(slug) + '/quote', {items},
    ),
  },
  competitions: {
    list: (eventId: string) => request<{ competitions: EventCompetitionView[]; canManage: boolean; paidVotingEnabled: false }>(
      'GET', '/events/' + encodeURIComponent(eventId) + '/competitions',
    ),
    vote: (competitionId: string, categoryId: string, nomineeId: string) =>
      request<{ accepted: true; categoryId: string; nomineeId: string }>(
        'POST', '/competitions/' + encodeURIComponent(competitionId) + '/vote',
        { categoryId, nomineeId },
      ),
  },
  community: {
    list: (eventId: string, page = 1) => request<CommunityThreadPage>(
      'GET', '/events/' + encodeURIComponent(eventId) + '/comments?pageSize=12&page=' + page,
    ),
    post: (eventId: string, body: string, parentId?: string) => request<{ comment: CommunityComment }>(
      'POST', '/events/' + encodeURIComponent(eventId) + '/comments',
      { body, ...(parentId ? { parentId } : {}) },
    ),
    remove: (commentId: string) => request<{ removed: boolean }>(
      'POST', '/comments/' + encodeURIComponent(commentId), {},
    ),
    report: (commentId: string) => request<{ report: { id: string } }>(
      'POST', '/social/report', { targetType: 'COMMENT', targetId: commentId, reason: 'OTHER' },
    ),
  },
  social: {
    /** Opt-in chronological timeline of public activity by followed organizers. */
    feed: (cursor?: string | null) => request<NativeFollowingPage>(
      'GET', '/social/feed?pageSize=12' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
    ),
    react: (clipId: string) => request<{ ok: boolean }>(
      'POST', '/social/reaction', { targetType: 'MEDIA', targetId: clipId, kind: 'HEART' },
    ),
  },
  networking: {
    list: (eventId: string, cursor?: string) => request<EventNetworkResponse>(
      'GET', '/events/' + encodeURIComponent(eventId) + '/network' +
        (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
    ),
    consent: (eventId: string, action: 'join' | 'leave') => request<{ optedIn: boolean }>(
      'POST', '/events/' + encodeURIComponent(eventId) + '/network', { action },
    ),
    follow: (userId: string, action: 'follow' | 'unfollow') => request<{ following: boolean }>(
      'POST', '/social/' + action, { userId },
    ),
    report: (userId: string) => request<{ report: { id: string } }>(
      'POST', '/social/report', { targetType: 'USER', targetId: userId, reason: 'OTHER' },
    ),
    block: (userId: string) => request<{ ok: boolean }>(
      'POST', '/social/block', { userId },
    ),
  },
  meetings: {
    detail: (id: string) => request<{
      meeting: { id: string; title: string; status: string; mediaEngine: string }
      access: { canJoin: boolean; canManage: boolean }
    }>('GET', '/meetings/' + encodeURIComponent(id) + '/detail'),
    joinCredentials: (id: string) => request<{ token: string; serverUrl: string }>(
      'POST', '/meetings/' + encodeURIComponent(id) + '/sfu-token', {},
    ),
    forEvent: (eventId: string) => request<{
      enabled: boolean
      canManage: boolean
      meeting: null | {
        id: string
        title: string
        status: string
        mediaEngine: string
        screenShareEnabled: boolean
      }
    }>('GET', `/events/${encodeURIComponent(eventId)}/meeting`),
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
  directCalls: {
    incoming: (userId:string)=>request<{enabled:boolean;mediaAvailable:boolean;items:DirectCall[];serverNow?:string}>('GET','/direct-calls?expectedUserId='+encodeURIComponent(userId)),
    list: (conversationId:string,userId:string)=>request<{enabled:boolean;mediaAvailable:boolean;items:DirectCall[];serverNow?:string}>('GET','/direct-calls?conversationId='+encodeURIComponent(conversationId)+'&expectedUserId='+encodeURIComponent(userId)),
    mutate: (data:Record<string,unknown>)=>request<{call:DirectCall;replayed?:boolean}>('POST','/direct-calls',data),
  },
  directMessages: {
    list: (page=1)=>request<{items:DirectConversation[];hasMore:boolean}>('GET','/direct-messages?page='+page),
    contacts: (q:string)=>request<{items:DirectContact[]}>('GET','/direct-messages?contacts=1&q='+encodeURIComponent(q)),
    detail: (id:string,before?:string)=>request<DirectDetail>('GET','/direct-messages?id='+encodeURIComponent(id)+(before?'&before='+encodeURIComponent(before):'')),
    mutate: (data:Record<string,unknown>)=>request<{conversation?:DirectConversation;message?:DirectMessage;marked?:number;replayed?:boolean}>('POST','/direct-messages',data),
    sendStatus: (id:string,expectedUserId:string,clientKey:string)=>request<{committed:boolean}>('POST','/direct-messages',{action:'send-status',id,expectedUserId,clientKey}),
    attachmentConfig: ()=>request<{enabled:boolean;maxBytes:number}>('GET','/direct-messages/attachments'),
    uploadAttachment: (form:FormData)=>request<{message:DirectMessage;replayed:boolean}>('POST','/direct-messages/attachments',form),
    getAttachment: (messageId:string,userId:string)=>request<DirectAttachment&{base64:string}>('GET','/direct-messages/attachments?encoding=base64&messageId='+encodeURIComponent(messageId)+'&expectedUserId='+encodeURIComponent(userId)),
    activity: (data:{id:string;expectedUserId:string;share:boolean;typing:boolean})=>request<{active:boolean;typing:boolean}>('POST','/direct-messages',{action:'activity',...data}),
  },
  notifications: {
    devices: (userId:string)=>request<{accountEnabled:boolean;deliveryEnabled:boolean;hasMore:boolean;items:PushDevice[]}>('GET','/notifications/devices/manage?expectedUserId='+encodeURIComponent(userId)),
    removeDevice: (userId:string,id:string)=>request<{ok:boolean}>('POST','/notifications/devices/manage',{expectedUserId:userId,id}),
    list: (page=1) => request<NotificationsResponse>('GET','/notifications?page='+page+'&pageSize=20'),
    mark: (id:string) => request<{ok:boolean}>('POST','/notifications',{id}),
    markAll: () => request<{ok:boolean}>('POST','/notifications',{all:true}),
    registerDevice: (data:{installationKey:string;providerToken:string;platform:'ANDROID'|'IOS';permissionGranted:true;expectedUserId:string;enableAccountPush?:boolean},signal?:AbortSignal) =>
      request<{registered:boolean;deliveryEnabled:boolean;leaseUntil?:string|null}>('POST','/notifications/devices',data,signal),
    revokeDevice: (installationKey:string,expectedUserId:string,signal?:AbortSignal) =>
      request<{registered:boolean;deliveryEnabled:boolean;leaseUntil?:string|null}>('DELETE','/notifications/devices',{installationKey,expectedUserId},signal),
  },
}

// ───────────────────────────────────── shared formatting helpers (GHS) ──────

export function formatMinor(minor: number, currency = 'GHS'): string {
  const amount = (minor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  return currency === 'GHS' ? `₵${amount}` : `${currency} ${amount}`
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

export type NativeSellerPaymentPreferences={mobileMoney:boolean;card:boolean;cash:boolean;destination:'BANK'|'MOMO'}
export type NativeSellerPaymentSettings={preferences:NativeSellerPaymentPreferences;commissionBps:number|null;commissionScope:string|null;settlementStatus:string;settlementAccount:{maskedAccount:string|null;bankName:string|null}|null;checkoutEnabled:false}
