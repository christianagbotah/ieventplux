'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ORGANIZER_TYPE_CONFIG, type OrganizerType, type ProfileDetails } from '@/lib/organization-types'

/** Only the selected organizer category's fields are displayed and submitted. */
export function OrganizerTypeDetails({ type, value, onChange }: {
  type: OrganizerType
  value: ProfileDetails
  onChange: (value: ProfileDetails) => void
}) {
  const config = ORGANIZER_TYPE_CONFIG[type]
  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-4" aria-label={config.detailsTitle}>
      <h3 className="text-sm font-bold">{config.detailsTitle}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{config.detailsDescription} All fields below are optional.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {config.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={'organizer-detail-' + field.key}>{field.label}</Label>
            <Input
              id={'organizer-detail-' + field.key}
              value={value[field.key] ?? ''}
              maxLength={160}
              onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
              placeholder={field.placeholder}
            />
            {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
