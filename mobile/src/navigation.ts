/**
 * Navigation types shared by App.tsx and every screen (avoids circular imports
 * between screens and the root component).
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

export type RootStackParamList = {
  /** Signed-out gate. Replaced (not pushed) after a successful login. */
  Login: undefined
  /** Event discovery feed (GET /api/v1/discovery/home). */
  Discover: undefined
  LiveHub: undefined
  Following: undefined
  Reels: undefined
  Account: undefined
  OrganizerStudio: undefined
  EventEditor: {orgId:string;eventId?:string}
  /** Event detail + checkout. Accepts the event id or slug. */
  EventDetail: { eventId: string }
  /** My tickets + order history. `orderRef` is set by the ieventplux://order/{ref}
   *  deep link (payment return) — the screen then surfaces a status banner and
   *  refreshes. The offline wallet (cached tickets + opened QR credentials)
   *  keeps the door credential alive without connectivity. */
  MyTickets: { orderRef?: string } | undefined
  /** Venue check-in scanner. `eventId` comes from the event detail screen for
   *  staff (canManage) or is entered manually on the scanner itself. */
  Checkin: { eventId?: string } | undefined
  /** Broadcast viewer (live + replay). `broadcastId` comes from the Discover
   *  Live-now section; the event detail screen can also route here. */
  Broadcast: { broadcastId: string }
  /** Meeting access + native device permissions; video presently opens system browser. */
  MeetingAccess: { eventId: string }
  /** Real native event discussions, using the existing moderated comments API. */
  EventCommunity: { eventId: string; eventTitle: string; status: string; canManage: boolean }
  /** Private-by-default and consented native event attendee networking. */
  EventNetwork: { eventId: string; eventTitle: string }
  EventCompetitions: { eventId: string; eventTitle: string }
  Marketplace: undefined
  MarketplaceStore: { slug: string }
  /** Native LiveKit client in a custom development build only; token stays in RAM. */
  NativeMeeting: {
    meetingId: string
    serverUrl: string
    token: string
    microphone: boolean
    camera: boolean
  }
}

export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>
export type DiscoverScreenProps = NativeStackScreenProps<RootStackParamList, 'Discover'>
export type EventDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'EventDetail'>
export type MyTicketsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyTickets'>
export type CheckinScreenProps = NativeStackScreenProps<RootStackParamList, 'Checkin'>
export type BroadcastScreenProps = NativeStackScreenProps<RootStackParamList, 'Broadcast'>

export type MeetingAccessScreenProps = NativeStackScreenProps<RootStackParamList, 'MeetingAccess'>
export type NativeMeetingScreenProps = NativeStackScreenProps<RootStackParamList, 'NativeMeeting'>

export type EventCommunityScreenProps = NativeStackScreenProps<RootStackParamList, 'EventCommunity'>
export type EventNetworkScreenProps = NativeStackScreenProps<RootStackParamList, 'EventNetwork'>

export type EventCompetitionsScreenProps = NativeStackScreenProps<RootStackParamList, 'EventCompetitions'>

export type MarketplaceScreenProps = NativeStackScreenProps<RootStackParamList, 'Marketplace'>
export type MarketplaceStoreScreenProps = NativeStackScreenProps<RootStackParamList, 'MarketplaceStore'>

export type LiveHubScreenProps = NativeStackScreenProps<RootStackParamList, 'LiveHub'>
export type AccountScreenProps = NativeStackScreenProps<RootStackParamList, 'Account'>

export type FollowingScreenProps = NativeStackScreenProps<RootStackParamList, 'Following'>
export type ReelsScreenProps = NativeStackScreenProps<RootStackParamList, 'Reels'>

export type OrganizerStudioScreenProps = NativeStackScreenProps<RootStackParamList, 'OrganizerStudio'>
export type EventEditorScreenProps = NativeStackScreenProps<RootStackParamList, 'EventEditor'>
