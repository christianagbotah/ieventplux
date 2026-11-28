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

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { lazy, Suspense, useCallback, useState } from 'react'
import { NavigationContainer, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SessionProvider, useSession } from './src/store/session'
import { theme } from './src/theme'
import type { RootStackParamList, NativeMeetingScreenProps } from './src/navigation'
import LoginScreen from './src/screens/LoginScreen'
import DiscoverScreen from './src/screens/DiscoverScreen'
import LiveHubScreen from './src/screens/LiveHubScreen'
import FollowingScreen from './src/screens/FollowingScreen'
import ReelsScreen from './src/screens/ReelsScreen'
import AccountScreen from './src/screens/AccountScreen'
import NotificationsScreen from './src/screens/NotificationsScreen'
import DirectMessagesScreen from './src/screens/DirectMessagesScreen'
import ForegroundActivity from './src/components/ForegroundActivity'
import PushActivityBridge from './src/components/PushActivityBridge'
import IncomingCallInvitation from './src/components/IncomingCallInvitation'
import {activityDestination} from './src/lib/push-activity-policy'
import EditProfileScreen from './src/screens/EditProfileScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import EventManagementScreen from './src/screens/EventManagementScreen'
import CreateHubScreen from './src/screens/CreateHubScreen'
import SellerStudioScreen from './src/screens/SellerStudioScreen'
import SellerProductScreen from './src/screens/SellerProductScreen'
import OrganizerStudioScreen from './src/screens/OrganizerStudioScreen'
import CreateOrganizerScreen from './src/screens/CreateOrganizerScreen'
import EventEditorScreen from './src/screens/EventEditorScreen'
import EventDetailScreen from './src/screens/EventDetailScreen'
import MyTicketsScreen from './src/screens/MyTicketsScreen'
import CheckinScreen from './src/screens/CheckinScreen'
import BroadcastScreen from './src/screens/BroadcastScreen'
import MeetingAccessScreen from './src/screens/MeetingAccessScreen'
import EventCommunityScreen from './src/screens/EventCommunityScreen'
import EventNetworkScreen from './src/screens/EventNetworkScreen'
import EventCompetitionsScreen from './src/screens/EventCompetitionsScreen'
import ServiceEnquiriesScreen from './src/screens/ServiceEnquiriesScreen'
import TransportCharterPlannerScreen from './src/screens/TransportCharterPlannerScreen'
import TransportDriverRosterScreen from './src/screens/TransportDriverRosterScreen'
import ServicesScreen from './src/screens/ServicesScreen'
import MarketplaceScreen from './src/screens/MarketplaceScreen'
import MarketplaceStoreScreen from './src/screens/MarketplaceStoreScreen'
import { AndroidUpdateNotice } from './src/components/AndroidUpdateNotice'
import { AppTabBar } from './src/components/AppTabBar'
import { isMainTabRoute, requiresAuthentication, type MainTabRoute } from './src/lib/main-tabs'
import { AppBrand } from './src/components/AppBrand'

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
const navigationRef = createNavigationContainerRef<RootStackParamList>()

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
  const { status, error, refresh } = useSession()

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
        <Text style={styles.splashMessage}>We couldn't connect right now. Please check your internet and try again.</Text>
        <Pressable style={styles.retry} accessibilityRole="button" accessibilityLabel="Retry connection" onPress={() => void refresh()}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    )
  }

  return (
    <Stack.Navigator
      initialRouteName='Discover'
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.card },
        headerTintColor: theme.colors.primaryDark,
        headerShadowVisible: false,
        statusBarStyle: 'dark',
        headerTitleStyle: { fontWeight: '800', color: theme.colors.text, fontSize: 18 },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{title:'Edit profile'}}/>
      <Stack.Screen name="Register" component={RegisterScreen} options={{title:'Create your account'}}/>
      <Stack.Screen name="EventManagement" component={EventManagementScreen} options={{title:'Manage event'}}/>
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in', headerShown: false }} />
      <Stack.Screen name="Discover" component={DiscoverScreen} options={{ headerTitle: () => <AppBrand /> }} />
      <Stack.Screen name="LiveHub" component={LiveHubScreen} options={{ title: 'Live now' }} />
      <Stack.Screen name="Following" component={FollowingScreen} options={{ title: 'Following' }} />
      <Stack.Screen name="Reels" component={ReelsScreen} options={{ title: 'Reels' }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Your space' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="DirectMessages" component={DirectMessagesScreen} options={{title:'Messages'}}/>
      <Stack.Screen name="CreateHub" component={CreateHubScreen} options={{title:'Create & manage'}}/>
      <Stack.Screen name="SellerStudio" component={SellerStudioScreen} options={{title:'Seller Studio'}}/>
      <Stack.Screen name="SellerProduct" component={SellerProductScreen} options={{title:'Add product'}}/>
      <Stack.Screen name="OrganizerStudio" component={OrganizerStudioScreen} options={{ title: 'Organizer Studio' }} />
      <Stack.Screen name="CreateOrganizer" component={CreateOrganizerScreen} options={{ title: 'Create organizer profile' }} />
      <Stack.Screen name="EventEditor" component={EventEditorScreen} options={{ title: 'Event editor' }} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: 'Event' }} />
      <Stack.Screen name="MyTickets" component={MyTicketsScreen} options={{ title: 'My tickets' }} />
      <Stack.Screen name="Checkin" component={CheckinScreen} options={{ title: 'Check-in scanner' }} />
      <Stack.Screen name="Broadcast" component={BroadcastScreen} options={{ title: 'Live broadcast' }} />
      <Stack.Screen name="MeetingAccess" component={MeetingAccessScreen} options={{ title: 'Meeting & device access' }} />
      <Stack.Screen name="EventCommunity" component={EventCommunityScreen} options={{ title: 'Event conversations' }} />
      <Stack.Screen name="EventNetwork" component={EventNetworkScreen} options={{ title: 'Meet attendees' }} />
      <Stack.Screen name="EventCompetitions" component={EventCompetitionsScreen} options={{ title: 'Awards & voting' }} />
      <Stack.Screen name="ServiceEnquiries" component={ServiceEnquiriesScreen} options={{title:'Service enquiries'}}/>
      <Stack.Screen name="TransportCharterPlanner" component={TransportCharterPlannerScreen} options={{title:'Group travel'}}/>
      <Stack.Screen name="TransportDriverRoster" component={TransportDriverRosterScreen} options={{title:'Driver assignments'}}/>
      <Stack.Screen name="Services" component={ServicesScreen} options={{ title: 'Local services' }} />
      <Stack.Screen name="Marketplace" component={MarketplaceScreen} options={{ title: 'Shop & discover' }} />
      <Stack.Screen name="MarketplaceStore" component={MarketplaceStoreScreen} options={{ title: 'Storefront' }} />
      <Stack.Screen name="NativeMeeting" component={NativeMeetingLoader} options={{ headerShown: false, gestureEnabled: false, statusBarStyle: 'light' }} />
    </Stack.Navigator>
  )
}

function AppNavigation() {
  const { status, user } = useSession()
  const [currentRoute, setCurrentRoute] = useState<string | undefined>()
  const [currentThread,setCurrentThread]=useState<string|undefined>()
  const syncRoute = () => {
    const route=navigationRef.getCurrentRoute()
    setCurrentRoute(route?.name)
    setCurrentThread(route?.name==='DirectMessages'?(route.params as RootStackParamList['DirectMessages'])?.id:undefined)
  }
  const openPushActivity=useCallback(()=>{
    if(navigationRef.isReady())navigationRef.navigate(activityDestination(status==='authenticated'))
  },[status])
  const navigateTab = (route: MainTabRoute) => {
    if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name === route) return
    if (status !== 'authenticated' && requiresAuthentication(route)) {
      navigationRef.navigate('Login',{returnTo:route==='MyTickets'?'MyTickets':'Account'})
      return
    }
    navigationRef.navigate(route)
  }
  return <NavigationContainer ref={navigationRef} linking={linking} onReady={syncRoute} onStateChange={syncRoute}>
    <View style={styles.appContainer}>
      <AppRoutes />
      {status==='authenticated'&&user&&<IncomingCallInvitation key={user.id} userId={user.id} visible={!!currentRoute&&!['NativeMeeting','Broadcast','Login'].includes(currentRoute)} currentThread={currentThread} onAccepted={id=>{if(navigationRef.isReady())navigationRef.navigate('DirectMessages',{id})}}/>}
      <PushActivityBridge ready={!!currentRoute&&(status==='authenticated'||status==='anonymous')} userId={status==='authenticated'?user?.id:undefined} onOpen={openPushActivity}/>
      {status === 'authenticated' && user ? <ForegroundActivity key={user.id} userId={user.id}
        visible={currentRoute !== 'Notifications' && currentRoute !== 'NativeMeeting' && currentRoute !== 'Broadcast' && currentRoute !== 'Login'}
        onOpen={() => { if (navigationRef.isReady()) navigationRef.navigate('Notifications') }} /> : null}
      {(status === 'authenticated' || status === 'anonymous') && isMainTabRoute(currentRoute) ?
        <AppTabBar active={currentRoute} onSelect={navigateTab} /> : null}
      <AndroidUpdateNotice />
    </View>
  </NavigationContainer>
}

export default function App() {
  return <SessionProvider><SafeAreaProvider><AppNavigation /></SafeAreaProvider></SessionProvider>
}

const styles = StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: theme.colors.bg },
  splash: { flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  splashBrand: { fontSize: 28, fontWeight: '700', color: theme.colors.primary, marginBottom: theme.spacing.lg },
  splashError: { color: theme.colors.danger, fontSize: 12, textAlign: 'center' },
  splashMessage: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 21 },
  retry: { marginTop: 20, backgroundColor: theme.colors.primary, paddingVertical: 13, paddingHorizontal: 30, borderRadius: 13 },
  retryText: { color: '#fff', fontWeight: '800' },
})
