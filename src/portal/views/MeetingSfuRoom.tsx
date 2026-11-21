'use client'

import { useEffect, useState } from 'react'
import { LiveKitRoom, GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer, useTracks, ConnectionStateToast, useParticipants, useRoomContext } from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { Loader2, MonitorUp, ShieldCheck, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'

type SfuCredentials = { token: string; serverUrl: string }

function MeetingTracks({ screenSharingEnabled }: { screenSharingEnabled: boolean }) {
  // LiveKit pages large rooms rather than mounting an unbounded number of
  // video elements. Only published camera/screen tracks are subscribed.
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  return <div className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-xl bg-slate-950 text-white" data-lk-theme="default">
    <div className="min-h-[260px] flex-1 overflow-hidden p-2 sm:min-h-[360px]">
      <GridLayout tracks={tracks}>
        <ParticipantTile />
      </GridLayout>
    </div>
    <RoomAudioRenderer />
    <ConnectionStateToast />
    <div className="overflow-x-auto border-t border-white/10 p-2">
      <ControlBar controls={{ microphone: true, camera: true, screenShare: screenSharingEnabled, chat: false, settings: true, leave: true }} variation="verbose" />
    </div>
  </div>
}

function SfuHostParticipants({ meetingId }: { meetingId: string }) {
  const participants = useParticipants()
  const room = useRoomContext()
  const [search, setSearch] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const people = participants.filter((person) =>
    person.identity !== room.localParticipant.identity &&
    (person.name || person.identity).toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 30)
  return <details className="rounded-xl border bg-card p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Manage people in this meeting ({participants.length})</summary>
    <div className="mt-3 space-y-2">
      <label className="block text-xs">Search participant
        <input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={70}
          className="mt-1 h-9 w-full rounded-md border bg-background px-3" placeholder="Name or account..." />
      </label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {people.map((person) => <div key={person.identity} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2 py-1.5">
        <span className="min-w-0 truncate">{person.name || 'Participant'}</span>
        <Button size="sm" variant="destructive" disabled={working !== null}
          onClick={async () => {
            if (!window.confirm('Remove this user from the event meeting and chat until restored?')) return
            setWorking(person.identity); setError('')
            try {
              await api.post(`/meetings/${meetingId}/remove-participant`, { userId: person.identity })
            } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Could not remove participant.') }
            finally { setWorking(null) }
          }}>Remove</Button>
      </div>)}
      {participants.length > 30 && <p className="text-xs text-muted-foreground">Showing up to 30 matches. Search to find another participant.</p>}
    </div>
  </details>
}

export default function MeetingSfuRoom({
  meetingId, canJoin, canManage, screenSharingEnabled, onEnd,
}: {
  meetingId: string
  canJoin: boolean
  canManage: boolean
  screenSharingEnabled: boolean
  onEnd: () => void
}) {
  const [credentials, setCredentials] = useState<SfuCredentials | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const join = async () => {
    if (!canJoin || busy) return
    setBusy(true); setError(''); setStatus('')
    try {
      const response = await api.post<SfuCredentials>(`/meetings/${meetingId}/sfu-token`, {})
      if (!/^wss:\/\//.test(response.serverUrl) || !response.token) {
        throw new Error('The media server has returned an invalid connection.')
      }
      setCredentials(response)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Unable to join the media room.')
    } finally {
      setBusy(false)
    }
  }

  // The session is monitored independently of the LiveKit UI. On lost RSVP,
  // invalid tickets, host ban, or completed event we unmount the media room.
  // Host removals also use the server-side LiveKit RoomService API.
  useEffect(() => {
    if (!credentials) return
    let removed = false
    const timer = window.setInterval(() => {
      void api.get<{ meeting: { status: string }; access: { canJoin: boolean } }>(`/meetings/${meetingId}/detail`)
        .then((data) => {
          if (removed) return
          if (data.meeting.status !== 'LIVE' || !data.access.canJoin) {
            setCredentials(null)
            setError('Meeting ended or your event admission is no longer valid.')
          }
        }).catch((err) => {
          if (removed) return
          if (err instanceof ApiClientError && [401, 403, 404, 503].includes(err.status)) {
            setCredentials(null)
            setError('Your meeting access has been revoked.')
          }
        })
    }, 15_000)
    return () => { removed = true; window.clearInterval(timer) }
  }, [credentials, meetingId])

  useEffect(() => { setCredentials(null); setError(''); setStatus('') }, [meetingId])

  return <section className="min-w-0 space-y-3" aria-label="Scalable meeting media">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <UsersRound className="size-4" />
      <span>Scalable video meeting · no fixed application participant limit</span>
      {canManage && <span className="inline-flex items-center gap-1 text-primary"><ShieldCheck className="size-4" /> Host</span>}
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {status && <p role="status" className="rounded-lg border p-3 text-sm">{status}</p>}
    {credentials
      ? <LiveKitRoom
          token={credentials.token}
          serverUrl={credentials.serverUrl}
          connect={true}
          audio={true}
          video={true}
          options={{ adaptiveStream: true, dynacast: true }}
          onError={(err) => setError('Media connection failed: ' + err.message)}
          onDisconnected={() => { setCredentials(null); setStatus('You have left the meeting.') }}
        >
          <MeetingTracks screenSharingEnabled={screenSharingEnabled} />
          {canManage && <SfuHostParticipants meetingId={meetingId} />}
        </LiveKitRoom>
      : <div className="flex min-h-[240px] min-w-0 flex-col items-center justify-center gap-4 rounded-xl border bg-slate-950 px-4 py-8 text-center text-white">
          <MonitorUp className="size-11 text-white/70" aria-hidden />
          <p className="max-w-lg text-sm">Join the event's scalable audio and video room. Your browser will request permission before accessing your camera or microphone. Screen sharing is available on supported devices.</p>
          <Button disabled={!canJoin || busy} onClick={() => void join()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UsersRound className="mr-2 size-4" />}
            {busy ? 'Connecting…' : 'Join meeting'}
          </Button>
          {!canJoin && <p className="text-xs text-amber-200">This room requires an approved free-event RSVP or valid paid-event ticket.</p>}
        </div>}
    {canManage && <div className="flex justify-end">
      <Button variant="destructive" className="min-h-10" onClick={onEnd}>End meeting for everyone</Button>
    </div>}
    <p className="text-xs text-muted-foreground">The room has no fixed software participant limit, but capacity depends on the provisioned media nodes and network bandwidth. Event chat is saved separately. Calls are not recorded.</p>
  </section>
}
