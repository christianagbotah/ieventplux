'use client'

import type { LucideIcon } from 'lucide-react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

export interface WorkspaceNavItem {
  key: string
  label: string
  icon: LucideIcon
  group: string
}

interface WorkspaceNavigationProps {
  items: readonly WorkspaceNavItem[]
  active: string
  onSelect: (key: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  title: string
  id?: string
}

/**
 * Shared enterprise workspace navigation. Group labels, active states, focus
 * rings and compact tooltips are consistent in admin and organizer surfaces.
 * Scrolling belongs to the enclosing sidebar, never to the page content.
 */
export function WorkspaceNavigation({
  items, active, onSelect, collapsed = false, onToggleCollapse, title, id,
}: WorkspaceNavigationProps) {
  let previousGroup = ''
  return (
    <div className="ievx-workspace-navigation">
      <div className="ievx-workspace-navigation-head">
        {!collapsed && <span className="ievx-workspace-navigation-title">{title}</span>}
        {onToggleCollapse && (
          <button
            type="button"
            className="ievx-workspace-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </button>
        )}
      </div>
      <nav id={id} className="ievx-workspace-navigation-list" aria-label={title}>
        {items.map((item) => {
          const showGroup = item.group !== previousGroup
          previousGroup = item.group
          const selected = item.key === active
          return (
            <div key={item.key} className="min-w-0">
              {showGroup && (
                <p className={'ievx-workspace-group-label' + (collapsed ? ' ievx-workspace-group-label--compact' : '')}
                   aria-hidden="true">
                  {collapsed ? '·' : item.group}
                </p>
              )}
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                className={'ievx-workspace-nav-item' + (selected ? ' ievx-workspace-nav-item--active' : '') + (collapsed ? ' ievx-workspace-nav-item--compact' : '')}
                aria-current={selected ? 'page' : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="size-[18px] shrink-0" strokeWidth={selected ? 2.25 : 1.8} aria-hidden="true" />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {!collapsed && selected && <span className="ievx-workspace-nav-active-dot" aria-hidden="true" />}
              </button>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
