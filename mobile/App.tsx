/**
 * iEventPlux mobile root — navigation container + native stack.
 *
 * Stack: Login → Discover → EventDetail / MyTickets / Checkin.
 * Header is styled emerald (#059669) per the brand theme (src/theme.ts).
 *
 * Deep links (scheme `ieventplux`, registered in app.json):
 *  - ieventplux://order/{reference} → MyTickets with an `orderRef` banner.
 *    This is the documented hosted-checkout return path; payment state itself
 *    is only ever confirmed server-side via provider callbacks.
 *
 * Native LiveKit is implemented in source for custom development builds.
 * This work has not passed physical-device certification; previously,
 * environment that produced it (no node_modules / lockfile are committed).
 * See mobile/README.md and mobile/docs/NATIVE_MODULES.md.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { lazy, Suspense } from 'react'
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SessionProvider, useSession } from './src/store/session'
import { theme } from './src/theme'
import type { RootStackParamList, NativeMeetingScreenProps } from './src/navigation'
import LoginScreen from './src/screens/LoginScreen'
import DiscoverScreen from './src/screens/DiscoverScreen'
import EventDetailScreen from './src/screens/EventDetailScreen'
import MyTicketsScreen from './src/screens/MyTicketsScreen'
import CheckinScreen from './src/screens/CheckinScreen'
import BroadcastScreen from './src/screens/BroadcastScreen'
import MeetingAccessScreen from './src/screens/MeetingAccessScreen'
import EventCommunityScreen from './src/screens/EventCommunityScreen'
import EventNetworkScreen from './src/screens/EventNetworkScreen'
import EventCompetitionsScreen from './src/screens/EventCompetitionsScreen'

/**
 * Keep the native WebRTC module out of Expo Go startup. Expo Go has no LiveKit
 * native bindings and can still use QR scanning and the system-browser fallback.
 * The real room is loaded only after a user opts to join in a custom build.
 */
function NativeMeetingLoader(props: NativeMeetingScreenProps) {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return <View style={styles.splash}><Text style={styles.splashError}>
      Native video meetings require an iEventPlux development build. Return to
      Meeting access to use the browser meeting instead.
    </Text></View>
  }
  return <Suspense fallback={<View style={styles.splash}>
    <ActivityIndicator color={theme.colors.primary} />
    <Text style={styles.splashError}>Loading secure native meeting…</Text>
  </View>}><NativeMeeting {...props} /></Suspense>
}

const NativeMeeting = lazy(() => import('./src/screens/NativeMeetingRoom'))

const Stack = createNativeStackNavigator<RootStackParamList>()

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['ieventplux://'],
  config: {
    screens: {
      Discover: '',
      MyTickets: 'order/:orderRef',
    },
  },
}

function AppRoutes() {
  const { status, error } = useSession()

  // Session restore (cookie jar → GET /auth/me) happens before navigation mounts,
  // so initialRouteName is decided once, after the real session state is known.
  if (status === 'restoring') {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashBrand}>iEventPlux</Text>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashBrand}>iEventPlux</Text>
        <Text style={styles.splashError}>
          Cannot reach the API. {error ?? ''}Set EXPO_PUBLIC_API_BASE_URL to your iEventPlux web
          deployment and restart.
        </Text>
      </View>
    )
  }

  return (
    <Stack.Navigator
      initialRouteName={status === 'authenticated' ? 'Discover' : 'Login'}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.primaryDark,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', color: theme.colors.text, fontSize: 17 },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in', headerShown: false }} />
      <Stack.Screen name="Discover" component={DiscoverScreen} options={{ title: 'Discover events' }} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: 'Event' }} />
      <Stack.Screen name="MyTickets" component={MyTicketsScreen} options={{ title: 'My tickets' }} />
      <Stack.Screen name="Checkin" component={CheckinScreen} options={{ title: 'Check-in scanner' }} />
      <Stack.Screen name="Broadcast" component={BroadcastScreen} options={{ title: 'Live broadcast' }} />
      <Stack.Screen name="MeetingAccess" component={MeetingAccessScreen} options={{ title: 'Meeting & device access' }} />
      <Stack.Screen name="EventCommunity" component={EventCommunityScreen} options={{ title: 'Event conversations' }} />
      <Stack.Screen name="EventNetwork" component={EventNetworkScreen} options={{ title: 'Meet attendees' }} />
      <Stack.Screen name="EventCompetitions" component={EventCompetitionsScreen} options={{ title: 'Awards & voting' }} />
      <Stack.Screen name="NativeMeeting" component={NativeMeetingLoader} options={{ headerShown: false, gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <NavigationContainer linking={linking}>
        <AppRoutes />
      </NavigationContainer>
    </SessionProvider>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  splashBrand: { fontSize: 28, fontWeight: '700', color: theme.colors.primary, marginBottom: theme.spacing.lg },
  splashError: { color: theme.colors.danger, fontSize: 12, textAlign: 'center' },
})
