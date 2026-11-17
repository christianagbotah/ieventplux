'use client'

import type { LucideIcon } from 'lucide-react'

/** Data-first metric tile shared across platform and organizer dashboards. */
export function WorkspaceMetric({
  label, value, icon: Icon, description, status = 'neutral',
}: {
  label: string
  value: string
  icon: LucideIcon
  description?: string
  status?: 'neutral' | 'warning' | 'danger'
}) {
  return (
    <div className="ievx-workspace-metric">
      <div className="ievx-workspace-metric-top">
        <span className="ievx-workspace-metric-label">{label}</span>
        <span className={'ievx-workspace-metric-icon ' + (status === 'danger' ? 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/30' : status === 'warning' ? 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30' : '')}>
          <Icon className="size-4" strokeWidth={1.9} aria-hidden="true" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="ievx-workspace-metric-value">{value}</p>
        {description && <p className="ievx-workspace-metric-foot mt-2">{description}</p>}
      </div>
    </div>
  )
}
