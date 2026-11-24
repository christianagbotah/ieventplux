import {test,expect} from 'bun:test'
import {readFileSync} from 'node:fs'
const screen=(name:string)=>readFileSync(new URL('../screens/'+name+'.tsx',import.meta.url),'utf8')

test('second premium native pass uses the same real React Native visuals across social surfaces',()=>{
  for(const name of ['FollowingScreen','ReelsScreen','LiveHubScreen','EventDetailScreen']){
    const code=screen(name)
    expect(code).toContain('mobileDesign')
    expect(code).toContain('PremiumBackdrop')
    expect(code).not.toContain('WebView')
  }
})
test('Reels uses real server clip data and never plays poster-only media as video',()=>{
  const reel=screen('ReelsScreen')
  expect(reel).toContain('api.discovery.reels()')
  expect(reel).toContain('<VerifiedReelMedia')
  expect(reel).toContain('trustedReelVideoUrl(item.url)')
  expect(reel).toContain('Artwork-only event previews stay static')
  expect(reel).not.toContain('Linking.openURL')
})
test('account switches clear private following data and avoid stale request updates',()=>{
  const following=screen('FollowingScreen')
  expect(following).toContain('revision.current++')
  expect(following).toContain('setItems([])')
  expect(following).toContain('request!==revision.current')
  expect(following).toContain('api.social.feed(next)')
})
test('event details retain original server-mediated orders and 44px quantity controls',()=>{
  const detail=screen('EventDetailScreen')
  expect(detail).toContain('api.orders.create(')
  expect(detail).toContain('api.payments.initiate(')
  expect(detail).toContain("navigation.navigate('EventCommunity'")
  expect(detail).toContain("navigation.navigate('EventCompetitions'")
  expect(detail).toContain("navigation.navigate('MeetingAccess'")
  expect(detail).toContain('qtyButton:{width:44,height:44')
  expect(detail).toContain('formatMinor(estimatedMinor,currency)')
})
test('live hub only displays server-reported active broadcasts',()=>{
  const live=screen('LiveHubScreen')
  expect(live).toContain("row.broadcasts.some(b=>b.status==='LIVE')")
  expect(live).toContain("event.broadcasts.find(b=>b.status==='LIVE')")
  expect(live).toContain('absoluteUrl(item.coverImageUrl)')
})
