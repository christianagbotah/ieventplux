'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import {
  Compass, Radio, Film, Palette, Search, Ticket, LayoutDashboard, ShieldCheck, LogOut,
  Sparkles, UserRound, Sun, Moon, Wand2, Loader2, CalendarDays,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { navigate } from '../router'
import { usePortal, isOrganizer, isPlatformStaff } from '../store'
import { api } from '../api'
import { dateShort } from '../format'
import type { EventCardData } from './EventCard'

/**
 * Global command palette (Cmd/Ctrl+K): navigation, live event search over the
 * REAL discovery API, and quick actions. Light-weight fuzzy matching via cmdk.
 */

interface PaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogout: () => void
}

export function CommandPalette({ open, onOpenChange, onLogout }: PaletteProps) {
  const { user, memberships } = usePortal()
  const { theme, setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventCardData[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  // Debounced real search against the public events API.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.get<{ items: EventCardData[] }>(`/events?q=${encodeURIComponent(q)}&pageSize=6`)
        setResults(data.items ?? [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const run = useCallback((action: () => void) => {
    onOpenChange(false)
    action()
  }, [onOpenChange])

  const navItems = useMemo(
    () => [
      { label: 'Discover events', icon: Compass, action: () => navigate('/') },
      { label: 'Live now', icon: Radio, action: () => navigate('/live') },
      { label: 'Reels', icon: Film, action: () => navigate('/reels') },
      { label: 'Effects Studio', icon: Palette, action: () => navigate('/effects') },
      { label: 'AI search', icon: Wand2, action: () => navigate('/#ai-search') },
    ],
    []
  )

  const accountItems = useMemo(() => {
    const items: { label: string; icon: React.ComponentType<{ className?: string }>; action: () => void }[] = []
    if (user) {
      items.push({ label: 'My tickets', icon: Ticket, action: () => navigate('/me?tab=tickets') })
      items.push({ label: 'Orders & profile', icon: UserRound, action: () => navigate('/me?tab=orders') })
      if (isOrganizer(user, memberships)) {
        items.push({ label: 'Organizer workspace', icon: LayoutDashboard, action: () => navigate('/organizer') })
        items.push({ label: 'AI Content Studio', icon: Sparkles, action: () => navigate('/ai-studio') })
      }
      if (isPlatformStaff(user)) {
        items.push({ label: 'Platform admin', icon: ShieldCheck, action: () => navigate('/admin') })
      }
    } else {
      items.push({ label: 'Sign in', icon: UserRound, action: () => navigate('/signin') })
    }
    return items
  }, [user, memberships])

  const go = (slug: string) => run(() => navigate(`/event/${slug}`))

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} aria-label="Command palette">
      <CommandInput
        placeholder="Search events or jump to a page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{searching ? 'Searching…' : query.trim().length >= 2 ? 'No matches found.' : 'Type to search events.'}</CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading={searching ? 'Events — searching…' : 'Events'}>
            {results.map((event) => (
              <CommandItem key={event.id} value={`event-${event.slug}-${event.title}`} onSelect={() => go(event.slug)}>
                {event.coverImageUrl ? (
                  <img src={event.coverImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {event.org?.name} · {dateShort(event.startsAt)}{event.city ? ` · ${event.city}` : ''}
                  </p>
                </div>
              </CommandItem>
            ))}
            <CommandItem value="see-all-search-results" onSelect={() => run(() => navigate(`/search?q=${encodeURIComponent(query.trim())}`))}>
              <Search className="h-4 w-4" /> See all results for “{query.trim()}”
            </CommandItem>
          </CommandGroup>
        )}
        {results.length > 0 && <CommandSeparator />}

        <CommandGroup heading="Go to">
          {navItems.map((item) => (
            <CommandItem key={item.label} value={`nav-${item.label}`} onSelect={() => run(item.action)}>
              <item.icon className="h-4 w-4" /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading={user ? 'Account' : 'Get started'}>
          {accountItems.map((item) => (
            <CommandItem key={item.label} value={`account-${item.label}`} onSelect={() => run(item.action)}>
              <item.icon className="h-4 w-4" /> {item.label}
            </CommandItem>
          ))}
          <CommandItem
            value="toggle-theme"
            onSelect={() => run(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
          </CommandItem>
          {user && (
            <CommandItem value="sign-out" onSelect={() => run(onLogout)}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
