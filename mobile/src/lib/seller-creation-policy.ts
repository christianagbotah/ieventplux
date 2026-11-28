export function sellerSlug(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'')}
export function validSellerSlug(value:string){return /^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(value)}
export function sellerPriceMinor(value:string){const m=/^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());if(!m)return null;const n=Number(m[1])*100+Number((m[2]??'').padEnd(2,'0'));return n>=1&&n<=100000000?n:null}
export function sellerStockDelta(value:string){if(!/^-?\d{1,6}$/.test(value.trim()))return null;const n=Number(value);return Number.isSafeInteger(n)&&n!==0&&Math.abs(n)<=100000?n:null}
