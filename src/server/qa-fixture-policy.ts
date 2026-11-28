/** Reserved synthetic namespace: deliberately cannot authorize real money or external delivery. */
export function isQaFixtureId(value:string|null|undefined){return typeof value==='string'&&value.startsWith('qa27-')}
export function isQaFixtureEmail(value:string|null|undefined){return typeof value==='string'&&value.trim().toLowerCase().endsWith('@qa.ieventplux.invalid')}
export function isQaFinancialRecord(row:{id?:string|null;orgId?:string|null;eventId?:string|null;userId?:string|null;buyerEmail?:string|null}){return [row.id,row.orgId,row.eventId,row.userId].some(isQaFixtureId)||isQaFixtureEmail(row.buyerEmail)}
export const QA_MONEY_BLOCKED='Simulated QA records cannot initiate real payments, refunds or payouts. Use the isolated payment sandbox.'
export function suppressQaExternalDelivery(message:{channel:string;userId?:string|null;orgId?:string|null;target:string}){return ['EMAIL','SMS'].includes(message.channel)&&([message.userId,message.orgId].some(isQaFixtureId)||isQaFixtureEmail(message.target))}
