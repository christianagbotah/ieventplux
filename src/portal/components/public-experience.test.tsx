import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroSpotlight } from './HeroSpotlight'
import { EventCard, EventRow, priceLabel, type EventCardData } from './EventCard'

const event: EventCardData = {
  id: 'public-event-1',
  slug: 'real-conference',
  title: 'The Global Community Conference',
  startsAt: '2026-11-28T17:00:00.000Z',
  status: 'PUBLISHED',
  mode: 'HYBRID',
  coverImageUrl: '/images/posters/business-summit.png',
  org: { name: 'Community Events', slug: 'community-events', verifiedAt: '2026-10-01T10:00:00.000Z' },
  ticketTypes: [{ priceMinor: 2500, currency: 'GHS', soldCount: 15, quota: 120 }],
}

describe('public homepage spotlight accessibility and truthful event info', () => {
  test('renders a real event, useful accessible action, organizer and image', () => {
    const markup = renderToStaticMarkup(createElement(HeroSpotlight, { event }))
    expect(markup).toContain('Explore featured event: The Global Community Conference')
    expect(markup).toContain('The Global Community Conference')
    expect(markup).toContain('Community Events')
    expect(markup).toContain('business-summit.png')
    expect(markup).toContain('Featured event')
    expect(markup).toContain('View details &amp; tickets')
  })

  test('no fake image, prices or organizer when the event has no poster', () => {
    const markup = renderToStaticMarkup(createElement(HeroSpotlight, {
      event: { id: 'event-2', slug: 'no-poster', title: 'Free open gathering', startsAt: event.startsAt, ticketTypes: [{ priceMinor: 0, currency: 'USD' }] },
    }))
    expect(markup).toContain('Free open gathering')
    expect(markup).toContain('Free')
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('Verified')
  })

  test('featured spotlight is a native deep link, not a simulated button', () => {
    const markup = renderToStaticMarkup(createElement(HeroSpotlight, { event }))
    expect(markup).toContain('href="#/event/real-conference"')
    expect(markup).not.toContain('<button')
  })

  test('event cards support long press, open in new tab and distinct footer controls', () => {
    const footer = createElement('button', { type: 'button' }, 'Save this event')
    const markup = renderToStaticMarkup(createElement(EventCard, { event, footer }))
    expect(markup).toContain('href="#/event/real-conference"')
    expect(markup).toContain('aria-label="View event: The Global Community Conference"')
    expect(markup).toContain('<button type="button">Save this event</button>')
    expect(markup).not.toContain('role="link"')
    expect(markup).not.toContain('tabindex="0"')
    // Interactive footer is a sibling of the overlay link, not a nested button.
    const linkStart = markup.indexOf('<a href="#/event/real-conference"')
    const linkEnd = markup.indexOf('</a>', linkStart)
    expect(linkStart).toBeGreaterThan(-1)
    expect(markup.slice(linkStart, linkEnd)).not.toContain('<button')
  })

  test('compact event rows expose shareable deep links', () => {
    const markup = renderToStaticMarkup(createElement(EventRow, { event }))
    expect(markup).toContain('href="#/event/real-conference"')
    expect(markup).toContain('aria-label="View event: The Global Community Conference"')
  })

  test('card prices stay in their original currency', () => {
    expect(priceLabel(event)).toContain('₵')
    expect(priceLabel({ ...event, ticketTypes: [{ priceMinor: 2000, currency: 'USD' }] })).toMatch(/\$|USD/)
    expect(priceLabel({ ...event, ticketTypes: [{ priceMinor: 0, currency: 'USD' }, { priceMinor: 2000, currency: 'USD' }] })).toBe('Free & paid')
    expect(priceLabel({ ...event, ticketTypes: [{ priceMinor: 2000, currency: 'USD' }, { priceMinor: 3000, currency: 'GHS' }] })).toBe('View ticket prices')
  })
})
