'use client'

import { useEffect, useState } from 'react'
import { LiveKitRoom, GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer, useTracks, usePagination, ConnectionStateToast, useParticipants, useRoomContext, LayoutContextProvider } from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { Loader2, MonitorUp, ShieldCheck, UsersRound, Camera, Mic, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, ApiClientError } from '../api'
import { useConfirm } from '@/components/ui/confirm-dialog-provider'
import { requestMeetingDevicePermissions, type DeviceChoices } from '../lib/meeting-device-permissions'
import { embeddedBrowserHint, testCaptureDevice, type MediaDeviceKind } from '../lib/device-access-diagnostics'

type SfuCredentials = { token: string; serverUrl: string; devices: DeviceChoices }

function MeetingTracks({ screenSharingEnabled }: { screenSharingEnabled: boolean }) {
  // LiveKit pages large rooms rather than mounting an unbounded number of
  // video elements. Only published camera/screen tracks are subscribed.
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ])
  // Paging controls the number of mounted video elements, NOT who can join.
  // All connected participants remain in the meeting regardless of page.
  const pagination = usePagination(12, tracks)
  const participants = useParticipants()
  return <div className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-xl bg-slate-950 text-white" data-lk-theme="default">
    <div className="min-h-[260px] flex-1 overflow-hidden p-2 sm:min-h-[360px]">
      <GridLayout tracks={pagination.tracks}>
        <ParticipantTile />
      </GridLayout>
    </div>
    {pagination.totalPageCount > 1 && <nav aria-label="Meeting video pages"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs">
      <span>{participants.length} participants · Video tiles {pagination.firstItemIndex + 1}–{Math.min(pagination.lastItemIndex, tracks.length)} of {tracks.length}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={pagination.currentPage <= 1}
          onClick={pagination.prevPage}>Previous</Button>
        <span>Page {pagination.currentPage} of {pagination.totalPageCount}</span>
        <Button size="sm" variant="secondary" disabled={pagination.currentPage >= pagination.totalPageCount}
          onClick={pagination.nextPage}>Next</Button>
      </div>
    </nav>}
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
  const confirm = useConfirm()
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
            if (!(await confirm({ title: 'Remove participant?', description: 'This person will lose access to the call and event chat until you restore their access.', confirmLabel: 'Remove participant', tone: 'danger' }))) return
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
  const [microphoneOn, setMicrophoneOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [browserHint, setBrowserHint] = useState<string | null>(null)
  const [secureBrowser, setSecureBrowser] = useState(true)
  const [deviceTest, setDeviceTest] = useState<Record<MediaDeviceKind, string>>({ camera: '', microphone: '' })
  const [testingDevice, setTestingDevice] = useState<MediaDeviceKind | null>(null)
  const [shareLink, setShareLink] = useState('')
  const [copyResult, setCopyResult] = useState('')

  useEffect(() => {
    setBrowserHint(embeddedBrowserHint(navigator.userAgent))
    setSecureBrowser(window.isSecureContext)
    setShareLink(window.location.href)
  }, [])

  const testDevice = async (kind: MediaDeviceKind) => {
    if (testingDevice) return
    setTestingDevice(kind)
    setDeviceTest((previous) => ({ ...previous, [kind]: '' }))
    try {
      await testCaptureDevice(kind, navigator.mediaDevices)
      setDeviceTest((previous) => ({ ...previous, [kind]: kind === 'camera' ? 'Camera test succeeded. Access is available.' : 'Microphone test succeeded. Access is available.' }))
    } catch (error) {
      setDeviceTest((previous) => ({ ...previous, [kind]: error instanceof Error ? error.message : 'Device check failed.' }))
    } finally { setTestingDevice(null) }
  }

  const copyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyResult('Meeting link copied. Paste it into Chrome or Samsung Internet.')
    } catch {
      setCopyResult('Select and copy the URL below, then open it in Chrome or Samsung Internet.')
    }
  }


  const join = async () => {
    if (!canJoin || busy) return
    setBusy(true); setError(''); setStatus('')
    try {
      // Request native permissions immediately on this user's Join gesture,
      // before an asynchronous API/token fetch can lose browser activation.
      await requestMeetingDevicePermissions(
        { microphone: microphoneOn, camera: cameraOn },
        navigator.mediaDevices,
      )
      const response = await api.post<{ token: string; serverUrl: string }>(`/meetings/${meetingId}/sfu-token`, {})
      if (!/^wss:\/\//.test(response.serverUrl) || !response.token) {
        throw new Error('The media server has returned an invalid connection.')
      }
      setCredentials({ ...response, devices: { microphone: microphoneOn, camera: cameraOn } })
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
          audio={credentials.devices.microphone}
          video={credentials.devices.camera}
          options={{ adaptiveStream: true, dynacast: true }}
          onError={() => setError('The media connection could not start. Check your network or open this meeting in Chrome or Samsung Internet.')}
          onDisconnected={() => { setCredentials(null); setStatus('You have left the meeting.') }}
        >
          <LayoutContextProvider>
            <MeetingTracks screenSharingEnabled={screenSharingEnabled} />
            {canManage && <SfuHostParticipants meetingId={meetingId} />}
          </LayoutContextProvider>
        </LiveKitRoom>
      : <div className="flex min-h-[240px] min-w-0 flex-col items-center justify-center gap-4 rounded-xl border bg-slate-950 px-4 py-8 text-center text-white">
          <MonitorUp className="size-11 text-white/70" aria-hidden />
          <p className="max-w-lg text-sm leading-6">Choose your devices, then join. The browser will request permission immediately. You can also join as a listener with both devices switched off.</p>
          <fieldset className="flex w-full max-w-sm flex-wrap justify-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
            <legend className="sr-only">Devices to use when joining</legend>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-sm">
              <input type="checkbox" className="size-4 accent-emerald-500" checked={microphoneOn} disabled={busy} onChange={(e) => setMicrophoneOn(e.target.checked)} />
              Microphone
            </label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-sm">
              <input type="checkbox" className="size-4 accent-emerald-500" checked={cameraOn} disabled={busy} onChange={(e) => setCameraOn(e.target.checked)} />
              Camera
            </label>
          </fieldset>
          {(browserHint || !secureBrowser) && <div role="status"
            className="w-full max-w-lg rounded-xl border border-amber-300/40 bg-amber-400/10 p-3 text-left text-xs leading-5 text-amber-100">
            <strong>{browserHint ? `${browserHint} in-app browser detected` : 'Secure device access unavailable'}</strong>
            <p className="mt-1">This browser may block camera and microphone prompts. Use its menu (⋮) to choose “Open in browser”, preferably Chrome or Samsung Internet. The website cannot override the host app's device restrictions.</p>
          </div>}
          <div className="w-full max-w-lg space-y-2 rounded-xl border border-white/15 bg-white/5 p-3 text-left">
            <p className="text-xs font-semibold">Check permissions before joining</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-lg bg-white/10 text-white hover:bg-white/20"
                disabled={testingDevice !== null} onClick={() => void testDevice('camera')}>
                {testingDevice === 'camera' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />} Test camera
              </Button>
              <Button type="button" size="sm" variant="outline" className="min-h-11 rounded-lg bg-white/10 text-white hover:bg-white/20"
                disabled={testingDevice !== null} onClick={() => void testDevice('microphone')}>
                {testingDevice === 'microphone' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mic className="size-4" aria-hidden />} Test microphone
              </Button>
            </div>
            {deviceTest.camera && <p role="status" className="text-xs leading-5">{deviceTest.camera}</p>}
            {deviceTest.microphone && <p role="status" className="text-xs leading-5">{deviceTest.microphone}</p>}
            <Button type="button" size="sm" variant="ghost" className="min-h-10 text-white underline underline-offset-2"
              onClick={() => void copyMeetingLink()}><Copy className="size-4" aria-hidden /> Copy meeting link for another browser</Button>
            {copyResult && <p role="status" className="break-words text-xs">{copyResult}</p>}
            {copyResult && <input aria-label="Meeting link to copy" readOnly value={shareLink}
              onFocus={(event) => event.target.select()} className="w-full rounded-lg border border-white/20 bg-black/30 p-2 text-xs text-white" />}
          </div>
          <Button disabled={!canJoin || busy} className="min-h-12 w-full max-w-xs rounded-xl" onClick={() => void join()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UsersRound className="mr-2 size-4" />}
            {busy ? 'Connecting…' : 'Join meeting'}
          </Button>
          {!canJoin && <p className="text-xs text-amber-200">This room requires an approved free-event RSVP or valid paid-event ticket.</p>}
          <p className="max-w-sm text-xs leading-5 text-white/65">If an in-app browser blocks camera or microphone access, use its menu to open this meeting in Chrome or Samsung Internet. Screen sharing also requires a supported browser and OS.</p>
        </div>}
    {canManage && <div className="flex justify-end">
      <Button variant="destructive" className="min-h-10" onClick={onEnd}>End meeting for everyone</Button>
    </div>}
    <p className="text-xs text-muted-foreground">The room has no fixed software participant limit, but capacity depends on the provisioned media nodes and network bandwidth. Event chat is saved separately. Calls are not recorded.</p>
  </section>
}
