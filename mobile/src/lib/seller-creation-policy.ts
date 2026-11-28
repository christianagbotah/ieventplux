export function sellerSlug(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'')}
export function validSellerSlug(value:string){return /^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(value)}
export function sellerPriceMinor(value:string){const m=/^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value.trim());if(!m)return null;const n=Number(m[1])*100+Number((m[2]??'').padEnd(2,'0'));return n>=1&&n<=100000000?n:null}
export function sellerStockDelta(value:string){if(!/^-?\d{1,6}$/.test(value.trim()))return null;const n=Number(value);return Number.isSafeInteger(n)&&n!==0&&Math.abs(n)<=100000?n:null}
export type SellerVariantForm={title:string;sku:string;price:string;color:string;size:string}
export function parseSellerVariants(rows:SellerVariantForm[]){
 if(rows.length<1||rows.length>24)return null
 const seen=new Set<string>(),result:{title:string;sku:string;priceMinor:number;optionValues:Record<string,string>}[]=[]
 for(const row of rows){const title=row.title.trim(),sku=row.sku.trim().toUpperCase(),priceMinor=sellerPriceMinor(row.price),color=row.color.trim(),size=row.size.trim();if(title.length<2||title.length>90||! /^[A-Z0-9][A-Z0-9_-]{2,49}$/.test(sku)||seen.has(sku)||priceMinor===null||color.length>80||size.length>80)return null;seen.add(sku);const optionValues:Record<string,string>={};if(color)optionValues.Color=color;if(size)optionValues.Size=size;result.push({title,sku,priceMinor,optionValues})}
 return result
}
