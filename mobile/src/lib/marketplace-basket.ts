/** Draft-only: the server recalculates price, inventory and availability. */
export function marketplaceBasketSelection(quantities:Record<string,number>){
  return Object.entries(quantities)
    .filter(([,quantity])=>Number.isSafeInteger(quantity)&&quantity>0)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([variantId,quantity])=>({variantId,quantity}))
}
