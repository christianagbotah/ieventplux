'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigate } from '../router'

type Props = { children: ReactNode; scope: 'page' | 'media' }
type State = { failed: boolean }

/** Keep unexpected meeting and LiveKit rendering errors out of the main app shell. */
export class MeetingErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, _details: ErrorInfo) {
    // No private meeting data, chat messages, participant IDs or tokens.
    console.error('iEventPlux meeting interface failed:', error.name)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const mediaOnly = this.props.scope === 'media'
    return <section role="alert" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-2xl border border-amber-500/35 bg-card px-5 py-10 text-center shadow-sm sm:px-8">
      <span className="grid size-12 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">{mediaOnly ? 'The video room could not open' : 'The meeting screen could not load'}</h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {mediaOnly
          ? 'Your event chat remains available below. Reload to retry the video room. Allow camera and microphone access when prompted.'
          : 'A browser file may be outdated after an update. Reload to get the latest meeting screen without signing out.'}
      </p>
      <div className="flex w-full flex-wrap justify-center gap-2">
        <Button type="button" className="min-h-11" onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" aria-hidden /> Reload meeting
        </Button>
        {!mediaOnly && <Button type="button" variant="outline" className="min-h-11" onClick={() => navigate('/')}>
          <ArrowLeft className="size-4" aria-hidden /> Browse events
        </Button>}
      </div>
    </section>
  }
}
