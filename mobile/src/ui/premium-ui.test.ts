import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'

const screen=(name:string)=>readFileSync(new URL(`../screens/${name}.tsx`,import.meta.url),'utf8')
const components=readFileSync(new URL('./PremiumUI.tsx',import.meta.url),'utf8')

test('shared React Native visual system is image-free, scalable, and genuinely native',()=>{
  expect(components).toContain('react-native-svg')
  expect(components).toContain('PremiumBackdrop')
  expect(components).toContain('SectionHeading')
  expect(components).toContain('TileGlyph')
  expect(components).toContain('SurfaceCard')
  expect(components).not.toContain('WebView')
  expect(components).not.toContain('https://')
})
test('high traffic native screens use the same hero art and typography system',()=>{
  for(const name of ['DiscoverScreen','LoginScreen','AccountScreen','MarketplaceScreen',
    'MyTicketsScreen','OrganizerStudioScreen','EventEditorScreen','CreateOrganizerScreen','CreateHubScreen','SellerStudioScreen','SellerProductScreen']){
    expect(screen(name)).toContain('PremiumBackdrop')
  }
})
test('mobile creator journey remains native, and account labels web-only tools honestly',()=>{
  const discover=screen('DiscoverScreen')
  expect(discover).toContain("navigation.navigate(status === 'authenticated' ? 'OrganizerStudio' : 'Login')")
  const account=screen('AccountScreen')
  expect(account).toContain('web?<LabelPill label="WEB"')
  const nav=readFileSync(new URL('../components/AppTabBar.tsx',import.meta.url),'utf8')
  expect(nav).toContain('useSafeAreaInsets')
  expect(nav).toContain('MAIN_TABS.map')
})

test('native seller workflow exposes creation, publication and stock without embedded web',()=>{
 const hub=screen('CreateHubScreen'),studio=screen('SellerStudioScreen'),product=screen('SellerProductScreen'),store=screen('MarketplaceStoreScreen')
 for(const route of ['OrganizerStudio','CreateOrganizer','SellerStudio','Services'])expect(hub).toContain(route)
 expect(studio).toContain('api.marketplace.createStore')
 expect(product).toContain('api.marketplace.createProduct')
 expect(store).toContain('api.marketplace.adjustStock')
 expect(store).toContain('api.marketplace.publishProduct')
 expect(store).toContain('api.marketplace.updateStore')
 for(const content of [hub,studio,product])expect(content).not.toContain('WebView')
})

test('native registration and organizer operations use existing server endpoints',()=>{expect(screen('RegisterScreen')).toContain('api.auth.register');const manage=screen('EventManagementScreen');for(const action of ['eventStats','eventOrders','eventAttendees','createTicketType','publishEvent'])expect(manage).toContain('api.organizer.'+action);expect(manage).not.toContain('WebView')})

test('native profile and storefront image workflows use authenticated API endpoints',()=>{const profile=screen('EditProfileScreen');expect(profile).toContain('api.auth.uploadProfileImage');expect(profile).toContain('expectedUserId');expect(profile).toContain('api.auth.updateProfile');expect(screen('MarketplaceStoreScreen')).toContain('api.marketplace.uploadImage');const product=screen('SellerProductScreen');expect(product).toContain('parseSellerVariants');expect(product).toContain('api.marketplace.uploadImage');expect(product).toContain('specifications:specs')})

test('native organizer artwork and profile operations stay in app',()=>{const org=screen('OrganizerProfileEditorScreen');expect(org).toContain('api.organizer.uploadBranding');expect(org).toContain('api.organizer.updateProfile');expect(org).toContain('result.canEdit');expect(screen('EventManagementScreen')).toContain('api.organizer.uploadEventArtwork');expect(screen('EventEditorScreen')).toContain('api.discovery.home()');expect(screen('EventEditorScreen')).toContain('ActionDialog')})
