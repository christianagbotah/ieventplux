import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('awards, discussions and networking use shared native design primitives',()=>{
  for(const screen of ['EventCompetitionsScreen','EventCommunityScreen','EventNetworkScreen']){
    const code=read(`screens/${screen}.tsx`)
    expect(code).toContain('PremiumBackdrop')
    expect(code).toContain('mobileDesign')
    expect(code).not.toContain('WebView')
  }
})
test('free votes remain server-authorized and confirm before submission',()=>{
  const c=read('screens/EventCompetitionsScreen.tsx')
  expect(c).toContain('api.competitions.vote(contest.id,category.id,nominee.id)')
  expect(c).toContain('category.myNomineeId')
  expect(c).toContain('contest.countsVisible')
  expect(c).toContain('No payment will be taken.')
  expect(c).toContain('<ActionDialog')
  expect(c).toContain('absoluteUrl(nominee.photoUrl)')
})
test('community and networking distinguish feedback from failures and drop stale private responses',()=>{
  for(const name of ['EventCommunityScreen','EventNetworkScreen']){
    const c=read(`screens/${name}.tsx`)
    expect(c).toContain('setFeedback(')
    expect(c).toContain('requestRevision.current++')
    expect(c).toContain('revision !== requestRevision.current')
    expect(c).toContain('absoluteUrl(')
  }
  const n=read('screens/EventNetworkScreen.tsx')
  expect(n).toContain('visibleEventNetwork(result)')
  expect(n).toContain("api.networking.consent(eventId, join ? 'join' : 'leave')")
  expect(n).toContain('requestRevision.current++')
})
test('all moderation, network consent and vote confirmations use a native modal with 48dp accessible actions',()=>{
  const dialog=read('components/ActionDialog.tsx')
  expect(dialog).toContain('<Modal transparent')
  expect(dialog.match(/minHeight:48/g)?.length).toBe(2)
  expect(dialog).toContain('destructive')
  expect(dialog).not.toContain('Alert.alert(')
})
