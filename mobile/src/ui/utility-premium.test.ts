import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
const screen=(name:string)=>readFileSync(new URL('../screens/'+name+'.tsx',import.meta.url),'utf8')

test('check-in, storefront and broadcast surfaces follow the native premium design system',()=>{
  for(const name of ['CheckinScreen','MarketplaceStoreScreen','BroadcastScreen']){
    const code=screen(name)
    expect(code).toContain('PremiumBackdrop')
    expect(code).toContain('mobileDesign')
    expect(code).not.toContain('WebView')
  }
})
test('native check-in preserves offline admission and server reconciliation',()=>{
  const code=screen('CheckinScreen')
  expect(code).toContain('api.checkin.scan(')
  expect(code).toContain('enqueueOfflineScan(')
  expect(code).toContain('syncOfflineQueue()')
  expect(code).toContain('barcodeScannerSettings')
  expect(code).toContain('onBarcodeScanned')
  expect(code).toContain('report.review.map(')
})
test('storefront uses real inventory and never presents a non-working checkout',()=>{
  const code=screen('MarketplaceStoreScreen')
  expect(code).toContain('api.marketplace.store(slug)')
  expect(code).toContain('absoluteUrl(item.images[0])')
  expect(code).toContain('formatMinor(variant.priceMinor,variant.currency)')
  expect(code).toContain('Checkout & delivery not yet available')
  expect(code).not.toContain('api.orders.create(')
  expect(code).not.toContain('Linking.openURL(')
})
test('broadcast remains clearly simulated until real verified streaming delivery exists',()=>{
  const code=screen('BroadcastScreen')
  expect(code).toContain('Simulated stream')
  expect(code).toContain('api.broadcasts.play(broadcastId)')
  expect(code).toContain('.heartbeat(broadcastId, token)')
  expect(code).toContain('api.broadcasts.chatSend(')
  expect(code).toContain('deliveryNote')
})
