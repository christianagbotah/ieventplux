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
