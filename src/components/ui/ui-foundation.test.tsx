import { describe, expect, test } from 'bun:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './button'
import { Input } from './input'
import { Textarea } from './textarea'
import { Card, CardContent, CardTitle } from './card'
import { Field, FieldLabel, FieldHelp, FieldError } from './field'

const render = (element: React.ReactElement) => renderToStaticMarkup(element)

describe('iEventPlux enterprise UI foundation', () => {
  test('buttons expose stable variants, sizes, touch-safe defaults and keyboard focus', () => {
    const html = render(React.createElement(Button, { variant: 'premium' }, 'Host meeting'))
    expect(html).toContain('data-slot="button"')
    expect(html).toContain('data-variant="premium"')
    expect(html).toContain('data-size="default"')
    expect(html).toContain('min-h-11')
    expect(html).toContain('focus-visible:ring-')
    expect(html).toContain('Host meeting')
  })

  test('asChild forwards precisely one child without triggering React.Children.only', () => {
    const html = render(React.createElement(Button, { asChild: true, variant: 'outline', size: 'icon', 'aria-label': 'Add to calendar' },
      React.createElement('a', { href: '/calendar.ics', download: true }, 'Calendar')))
    expect(html).toContain('<a ')
    expect(html).toContain('href="/calendar.ics"')
    expect(html).toContain('data-slot="button"')
    expect(html).toContain('Calendar</a>')
    expect(html).not.toContain('<button')
  })

  test('an asynchronous action announces busy state and disables repeated submits', () => {
    const html = render(React.createElement(Button, { loading: true, type: 'submit' }, 'Publish event'))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-loading="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('type="submit"')
    expect(html).toContain('Publish event')
  })

  test('disabled and size variants do not change the button contract', () => {
    const html = render(React.createElement(Button, { disabled: true, variant: 'outline', size: 'icon-sm', 'aria-label': 'Close' }, '×'))
    expect(html).toContain('disabled=""')
    expect(html).toContain('data-size="icon-sm"')
    expect(html).toContain('aria-label="Close"')
  })

  test('input and textarea expose disabled, error and accessibility attributes', () => {
    const input = render(React.createElement(Input, { id: 'attendee-email', type: 'email', required: true, 'aria-invalid': true, 'aria-describedby': 'email-error' }))
    expect(input).toContain('id="attendee-email"')
    expect(input).toContain('aria-invalid="true"')
    expect(input).toContain('aria-describedby="email-error"')
    expect(input).toContain('min-h-11')
    const textarea = render(React.createElement(Textarea, { id: 'event-description', 'aria-label': 'Event description' }))
    expect(textarea).toContain('data-slot="textarea"')
    expect(textarea).toContain('min-h-28')
  })

  test('field labels, help and errors remain semantic, cards retain visual structure', () => {
    const field = render(
      React.createElement(Field, null,
        React.createElement(FieldLabel, { htmlFor: 'meeting-capacity' }, 'Meeting capacity'),
        React.createElement(Input, { id: 'meeting-capacity' }),
        React.createElement(FieldHelp, { id: 'capacity-hint' }, 'Scalable mode'),
        React.createElement(FieldError, { id: 'capacity-error' }, 'Invalid capacity'),
      ),
    )
    expect(field).toContain('for="meeting-capacity"')
    expect(field).toContain('data-slot="field-help"')
    expect(field).toContain('role="alert"')
    const card = render(React.createElement(Card, null,
      React.createElement(CardTitle, null, 'Community event'),
      React.createElement(CardContent, null, 'Tickets and agenda'),
    ))
    expect(card).toContain('data-slot="card"')
    expect(card).toContain('data-slot="card-title"')
    expect(card).toContain('data-slot="card-content"')
  })
})
