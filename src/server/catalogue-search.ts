/** Honest catalogue-only search interpretation; intentionally NOT model AI. */
export type CatalogueFilters = {
  category?: string | null
  city?: string | null
  mode?: 'PHYSICAL' | 'VIRTUAL' | 'HYBRID' | null
  price?: 'FREE' | 'PAID' | null
  when?: 'TODAY' | 'THIS_WEEK' | 'THIS_WEEKEND' | null
  keywords?: string | null
}

export function interpretCatalogueQuery(
  phrase: string,
  categories: { slug: string; name: string }[],
  cities: string[],
): CatalogueFilters {
  const input = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  let remainder = ' ' + input + ' '
  const consume = (text: string): boolean => {
    const matching = ' ' + text.toLowerCase() + ' '
    const index = remainder.indexOf(matching)
    if (index === -1) return false
    remainder = remainder.slice(0, index) + ' ' + remainder.slice(index + matching.length)
    remainder = ' ' + remainder.trim().replace(/\s+/g, ' ') + ' '
    return true
  }
  const result: CatalogueFilters = {
    category: null, city: null, mode: null, price: null, when: null, keywords: null,
  }
  const city = [...cities].filter(Boolean).sort((a,b) => b.length - a.length).find(c => consume(c))
  if (city) result.city = city
  const category = [...categories].sort((a,b) => b.name.length - a.name.length)
    .find(c => consume(c.name) || consume(c.slug))
  if (category) result.category = category.slug
  if (consume('free') || consume('no cost') || consume('no charge')) result.price = 'FREE'
  else if (consume('paid') || consume('ticketed')) result.price = 'PAID'
  if (consume('this weekend') || consume('weekend')) result.when = 'THIS_WEEKEND'
  else if (consume('today')) result.when = 'TODAY'
  else if (consume('this week')) result.when = 'THIS_WEEK'
  if (consume('online') || consume('virtual') || consume('remote')) result.mode = 'VIRTUAL'
  else if (consume('hybrid')) result.mode = 'HYBRID'
  else if (consume('in person') || consume('physical')) result.mode = 'PHYSICAL'
  const stop = new Set(['event','events','an','a','in','at','near','for','the','to','my','me','show','find','looking','what','where','is','are','happening','around','this','i','want','join','please','give','any','can','you','with','on','from','of','and','services','gatherings','available','upcoming'])
  const remaining = remainder.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !stop.has(w))
  result.keywords = remaining.slice(0,4).join(' ') || null
  return result
}
