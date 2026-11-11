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
  /** Event detail + checkout. Accepts the event id or slug. */
  EventDetail: { eventId: string }
  /** My tickets. `orderRef` is set by the ieventplux://order/{ref} deep link
   *  (payment return) — the screen then surfaces a status banner and refreshes. */
  MyTickets: { orderRef?: string } | undefined
  /** Venue check-in scanner. `eventId` comes from the event detail screen for
   *  staff (canManage) or is entered manually on the scanner itself. */
  Checkin: { eventId?: string } | undefined
}

export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>
export type DiscoverScreenProps = NativeStackScreenProps<RootStackParamList, 'Discover'>
export type EventDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'EventDetail'>
export type MyTicketsScreenProps = NativeStackScreenProps<RootStackParamList, 'MyTickets'>
export type CheckinScreenProps = NativeStackScreenProps<RootStackParamList, 'Checkin'>
