import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MeetingErrorBoundary } from './MeetingErrorBoundary'

test('a lazy meeting chunk failure presents a reload action instead of a blank screen', () => {
  expect(MeetingErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true })
  const boundary = new MeetingErrorBoundary({ scope: 'page', children: null })
  boundary.state = { failed: true }
  const html = renderToStaticMarkup(boundary.render())
  expect(html).toContain('The meeting screen could not load')
  expect(html).toContain('Reload meeting')
  expect(html).toContain('Browse events')
})

test('a media-renderer failure preserves the surrounding meeting chat', () => {
  const boundary = new MeetingErrorBoundary({ scope: 'media', children: null })
  boundary.state = { failed: true }
  const html = renderToStaticMarkup(boundary.render())
  expect(html).toContain('The video room could not open')
  expect(html).toContain('Your event chat remains available')
  expect(html).not.toContain('Browse events')
})
