import {expect,test} from 'bun:test'
import {alertDestination,mergeAlerts} from './notification-inbox'
test('reminder and waitlist links resolve into native destinations',()=>{
 expect(alertDestination('#/me?tab=tickets')).toEqual({screen:'MyTickets',segment:'tickets'})
 expect(alertDestination('#/event/invite-only-event_123')).toEqual({screen:'EventDetail',eventId:'invite-only-event_123'})
 expect(alertDestination('/me?tab=orders')).toEqual({screen:'MyTickets',segment:'orders'})
 expect(alertDestination('#/shop/local-store')).toEqual({screen:'MarketplaceStore',slug:'local-store'})
 expect(alertDestination('#/shop/a%2Fb')).toBeNull()
})
test('external, encoded and unsupported links never become navigable',()=>{
 for(const path of ['https://example.com/event/a','//example.com/event/a','javascript:alert(1)','#/event/../admin','#/event/a%2Fb','#/event/a?token=x','#/admin','#/me?tab=profile',null])expect(alertDestination(path)).toBeNull()
})
test('overlapping paginated pages retain unique server IDs',()=>{
 expect(mergeAlerts([{id:'a'},{id:'b'}],[{id:'b'},{id:'c'},{id:'c'}])).toEqual([{id:'a'},{id:'b'},{id:'c'}])
})
