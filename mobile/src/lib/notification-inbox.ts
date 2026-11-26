/** Only route notification links to explicitly supported internal native destinations.
 * Never open arbitrary URLs, raw HTML, or web redirects from persisted alerts.
 */
export type AlertDestination = {screen:'EventDetail';eventId:string}|{screen:'MyTickets';segment:'tickets'|'orders'}
export function alertDestination(link:string|null|undefined):AlertDestination|null{
 if(!link)return null
 const path=link.startsWith('#')?link.slice(1):link
 const event=/^\/event\/([A-Za-z0-9_-]{1,128})$/.exec(path)
 if(event?.[1])return {screen:'EventDetail',eventId:event[1]}
 if(path==='/me?tab=tickets')return {screen:'MyTickets',segment:'tickets'}
 if(path==='/me?tab=orders')return {screen:'MyTickets',segment:'orders'}
 return null
}
export function mergeAlerts<T extends {id:string}>(older:T[],incoming:T[]):T[]{
 const seen=new Set(older.map(item=>item.id))
 return [...older,...incoming.filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true})]
}
