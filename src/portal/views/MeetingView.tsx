'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import {
  AlertTriangle, Camera, CameraOff, CheckCircle2, Copy, Loader2, MessageSquare,
  Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Play, RefreshCw, Send, ShieldCheck, Square, UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ApiClientError } from '../api'
import { connectRealtime } from '../realtime'
import { navigate } from '../router'
import { usePortal } from '../store'

type Meeting = {
  id: string; title: string; status: string; maxParticipants: number; chatEnabled: boolean;
  screenShareEnabled: boolean; startedAt: string | null; endedAt: string | null;
  event: { id: string; title: string; slug: string; status: string; orgName: string }
}
type MeetingDetail = {
  meeting: Meeting
  access: { canManage: boolean; canJoin: boolean }
  iceServers: RTCIceServer[]
  removedParticipants?: { userId: string; user: { displayName: string }; createdAt: string }[]
}
type ChatRow = {
  id: string; body: string; status: string; createdAt: string
  user: { id: string; displayName: string; avatarUrl: string | null }
}
type Peer = { id: string; userId: string; name: string; stream: MediaStream | null; state: string }
type Signal = { from: string; kind: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RTCIceCandidateInit }
type PeerConnection = { pc: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] }
const VIDEO_ERRORS = 'Media permissions or browser restrictions prevented camera/microphone access. You can still join for chat or receive other participants.'

function VideoTile({ stream, name, local, sharing }: { stream: MediaStream | null; name: string; local?: boolean; sharing?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (video.current) video.current.srcObject = stream
    return () => { if (video.current) video.current.srcObject = null }
  }, [stream])
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled))
  return <div className="relative flex aspect-video min-h-32 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white">
    {/* Keep the media element mounted even for audio-only tracks; conditional
        unmounting silences participants who have no camera. */}
    <video ref={video} autoPlay playsInline muted={local}
      className={`absolute inset-0 size-full object-contain ${hasVideo ? '' : 'pointer-events-none opacity-0'} ${local && !sharing ? '-scale-x-100' : ''}`} />
    {!hasVideo && <div className="grid size-16 place-items-center rounded-full bg-white/10 text-2xl font-bold">{name.slice(0, 2).toUpperCase()}</div>}
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/60 px-3 py-2 text-xs">
      <span className="truncate font-semibold">{name}{local ? ' (You)' : ''}</span>
      {sharing && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-primary-foreground">Sharing screen</span>}
    </div>
  </div>
}

export default function MeetingView({ id }: { id: string }) {
  const { user } = usePortal()
  const [data, setData] = useState<MeetingDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(false)
  const [peers, setPeers] = useState<Peer[]>([])
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [microphoneOn, setMicrophoneOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [capacity, setCapacity] = useState('6')
  const [title, setTitle] = useState('')
  const socket = useRef<Socket | null>(null)
  const connections = useRef(new Map<string, PeerConnection>())
  const media = useRef<MediaStream | null>(null)
  const screen = useRef<MediaStream | null>(null)
  const names = useRef(new Map<string, string>())
  const identities = useRef(new Map<string, string>())
  const remoteStreams = useRef(new Map<string, MediaStream>())
  const active = useRef(false)
  const chatEnd = useRef<HTMLDivElement>(null)
  const joinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const leave = useCallback(() => {
    if (joinTimeout.current) { clearTimeout(joinTimeout.current); joinTimeout.current = null }
    active.current = false
    socket.current?.emit('leave')
    socket.current?.disconnect()
    socket.current = null
    connections.current.forEach(({ pc }) => pc.close())
    connections.current.clear()
    remoteStreams.current.clear()
    names.current.clear()
    identities.current.clear()
    screen.current?.getTracks().forEach((track) => track.stop())
    screen.current = null
    media.current?.getTracks().forEach((track) => track.stop())
    media.current = null
    setPeers([])
    setJoined(false)
    setSharing(false)
  }, [])

  const load = useCallback(async () => {
    try {
      const result = await api.get<MeetingDetail>(`/meetings/${id}/detail`)
      setData(result)
      setTitle(result.meeting.title)
      setCapacity(String(result.meeting.maxParticipants))
      const chat = await api.get<{ items: ChatRow[] }>(`/meetings/${id}/chat?pageSize=60`).catch(() => ({ items: [] }))
      setMessages(chat.items)
      setError('')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load this group meeting.')
    }
  }, [id])

  useEffect(() => {
    void load()
    return () => leave()
  }, [load, leave])

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messages.length])
  // Chat is independent from the video room: refresh it while the host has not
  // started the call, after the call ends, or if realtime transport is down.
  useEffect(() => {
    if (!data?.meeting.chatEnabled || !user) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void api.get<{ items: ChatRow[] }>(`/meetings/${id}/chat?pageSize=60`).then((result) => {
        if (!cancelled) setMessages(result.items)
      }).catch(() => {})
    }, 8000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [data?.meeting.chatEnabled, id, user?.id])

  // A live call must not rely solely on the initial ticket/RSVP decision.
  // Polling also closes calls when the meeting/event becomes unavailable.
  useEffect(() => {
    if (!joined) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void api.get<MeetingDetail>(`/meetings/${id}/detail`).then((fresh) => {
        if (cancelled) return
        if (fresh.meeting.status !== 'LIVE' || !fresh.access.canJoin) {
          leave()
          setNotice('This meeting ended or your admission is no longer valid.')
        }
      }).catch((err) => {
        if (cancelled) return
        if (err instanceof ApiClientError && [401, 403, 404, 503].includes(err.status)) {
          leave()
          setError('Your meeting access is no longer available. Please contact the organizer.')
        }
      })
    }, 30_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [joined, id, leave])


  const syncPeer = (peerId: string, stream: MediaStream | null, state = 'connecting') => {
    const name = names.current.get(peerId) ?? 'Participant'
    const userId = identities.current.get(peerId) ?? ''
    setPeers((old) => {
      const current = old.find((row) => row.id === peerId)
      return current ? old.map((row) => row.id === peerId ? { ...row, name, userId, stream: stream ?? row.stream, state } : row)
        : [...old, { id: peerId, userId, name, stream, state }]
    })
  }

  const replaceTrack = async (kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
    await Promise.all([...connections.current.values()].map(async ({ pc }) => {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender
      if (sender) await sender.replaceTrack(track).catch(() => {})
    }))
  }

  const restoreCamera = useCallback(async () => {
    const shared = screen.current
    screen.current = null
    setSharing(false)
    const camera = media.current?.getVideoTracks()[0] ?? null
    await replaceTrack('video', camera?.enabled ? camera : null)
    shared?.getTracks().forEach((track) => track.stop())
  }, [])

  const createPeer = async (peerId: string): Promise<PeerConnection> => {
    const existing = connections.current.get(peerId)
    if (existing) return existing
    if (!data) throw new Error('Meeting settings not loaded.')
    const pc = new RTCPeerConnection({ iceServers: data.iceServers, bundlePolicy: 'max-bundle' })
    const audio = pc.addTransceiver('audio', { direction: 'sendrecv' })
    const video = pc.addTransceiver('video', { direction: 'sendrecv' })
    const entry = { pc, pendingCandidates: [] as RTCIceCandidateInit[] }
    connections.current.set(peerId, entry)
    const audioTrack = media.current?.getAudioTracks()[0] ?? null
    const videoTrack = screen.current?.getVideoTracks()[0] ?? media.current?.getVideoTracks()[0] ?? null
    await Promise.all([
      audio.sender.replaceTrack(audioTrack?.enabled ? audioTrack : null),
      video.sender.replaceTrack(videoTrack?.enabled ? videoTrack : null),
    ])
    pc.onicecandidate = (event) => {
      if (event.candidate && active.current) {
        socket.current?.emit('meeting:signal', { to: peerId, kind: 'candidate', candidate: event.candidate.toJSON() })
      }
    }
    pc.ontrack = (event) => {
      const stream = remoteStreams.current.get(peerId) ?? new MediaStream()
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track)
      remoteStreams.current.set(peerId, stream)
      syncPeer(peerId, stream, pc.connectionState)
      event.track.onended = () => syncPeer(peerId, stream, pc.connectionState)
    }
    pc.onconnectionstatechange = () => syncPeer(peerId, remoteStreams.current.get(peerId) ?? null, pc.connectionState)
    syncPeer(peerId, null)
    return entry
  }

  const handleSignal = async (signal: Signal) => {
    if (!active.current || !signal.from) return
    try {
      const entry = await createPeer(signal.from)
      const { pc } = entry
      if (signal.kind === 'offer' && signal.sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        for (const ice of entry.pendingCandidates.splice(0)) await pc.addIceCandidate(ice).catch(() => {})
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.current?.emit('meeting:signal', { to: signal.from, kind: 'answer', sdp: answer.sdp })
      } else if (signal.kind === 'answer' && signal.sdp) {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        for (const ice of entry.pendingCandidates.splice(0)) await pc.addIceCandidate(ice).catch(() => {})
      } else if (signal.kind === 'candidate' && signal.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => {})
        else entry.pendingCandidates.push(signal.candidate)
      }
    } catch {
      setNotice('A participant could not connect. Network restrictions may require the meeting TURN relay.')
    }
  }

  const join = async () => {
    if (!data?.access.canJoin || busy || joined || !user) return
    if (!window.RTCPeerConnection || !navigator.mediaDevices) {
      setError('This browser cannot join an interactive call. Try an updated browser over HTTPS.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      try {
        media.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 360 } })
      } catch {
        try { media.current = await navigator.mediaDevices.getUserMedia({ audio: true }) }
        catch { media.current = new MediaStream(); setNotice(VIDEO_ERRORS) }
      }
      const localVideo = media.current.getVideoTracks()[0]
      setCameraOn(Boolean(localVideo))
      setMicrophoneOn(Boolean(media.current.getAudioTracks()[0]))
      active.current = true
      const realtime = connectRealtime()
      socket.current = realtime
      let admitted = false
      joinTimeout.current = setTimeout(() => {
        if (active.current && !admitted) {
          leave()
          setBusy(false)
          setError('The meeting signaling service is unavailable. Check your connection and try again.')
        }
      }, 25_000)
      realtime.on('connect', () => realtime.emit('join', { room: `meeting:${id}` }))
      realtime.on('room:joined', (msg: { room: string }) => {
        if (msg.room === `meeting:${id}`) {
          admitted = true
          if (joinTimeout.current) { clearTimeout(joinTimeout.current); joinTimeout.current = null }
          setJoined(true); setBusy(false)
        }
      })
      realtime.on('room:denied', (msg: { code: string }) => {
        leave()
        setBusy(false)
        setError(msg.code === 'ROOM_FULL' ? 'This meeting is full. Try joining after another participant leaves.'
          : msg.code === 'MEETING_ENDED' ? 'The organizer has ended this meeting.'
            : 'Meeting access was denied. Check your event ticket, RSVP, or organizer permission.')
      })
      realtime.on('meeting:peers', (payload: { peers: { peerId: string; userId: string; name: string }[] }) => {
        if (!active.current) return
        void (async () => {
          for (const peer of payload.peers) {
            names.current.set(peer.peerId, peer.name)
            identities.current.set(peer.peerId, peer.userId)
            const { pc } = await createPeer(peer.peerId)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            realtime.emit('meeting:signal', { to: peer.peerId, kind: 'offer', sdp: offer.sdp })
          }
        })().catch(() => setNotice('Connection setup failed. Try leaving and rejoining.'))
      })
      realtime.on('meeting:peer-joined', (peer: { peerId: string; userId: string; name: string }) => {
        names.current.set(peer.peerId, peer.name)
        identities.current.set(peer.peerId, peer.userId)
        syncPeer(peer.peerId, null)
      })
      realtime.on('meeting:peer-left', (peer: { peerId: string }) => {
        connections.current.get(peer.peerId)?.pc.close()
        connections.current.delete(peer.peerId)
        names.current.delete(peer.peerId)
        identities.current.delete(peer.peerId)
        remoteStreams.current.delete(peer.peerId)
        setPeers((old) => old.filter((row) => row.id !== peer.peerId))
      })
      realtime.on('meeting:signal', (signal: Signal) => { void handleSignal(signal) })
      realtime.on('meeting:chat', (row: ChatRow) => {
        setMessages((old) => old.some((item) => item.id === row.id) ? old : [...old.slice(-99), row])
      })
      realtime.on('meeting:moderated', (payload: { id: string; status: string }) => {
        setMessages((old) => old.map((row) => row.id === payload.id ? { ...row, status: payload.status } : row))
      })
      realtime.on('meeting:removed', (payload: { message: string }) => {
        leave()
        setError(payload.message || 'Your meeting access was removed by the organizer.')
      })
      realtime.on('meeting:ended', () => {
        leave()
        setData((old) => old ? { ...old, meeting: { ...old.meeting, status: 'ENDED' }, access: { ...old.access, canJoin: false } } : old)
        setNotice('The organizer has ended the meeting.')
      })
      realtime.on('connect_error', () => setNotice('Meeting signaling is offline. Check your connection and try reconnecting.'))
      realtime.on('disconnect', () => {
        if (!active.current) return
        // A fresh socket ID needs fresh WebRTC peer connections and signaling.
        // Stale tracks/peer IDs cannot be reused after reconnect.
        connections.current.forEach(({ pc }) => pc.close())
        connections.current.clear()
        remoteStreams.current.clear()
        names.current.clear()
        identities.current.clear()
        setPeers([])
        setJoined(false)
        setNotice('Meeting connection interrupted. Reconnecting and negotiating again…')
      })
    } catch {
      leave()
      setBusy(false)
      setError('Unable to initialize your devices or meeting connection.')
    }
  }

  const toggleMicrophone = async () => {
    let track = media.current?.getAudioTracks()[0]
    if (!track) {
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true })
        track = audio.getAudioTracks()[0]
        media.current?.addTrack(track)
        await replaceTrack('audio', track)
      } catch { setNotice('Microphone permission was denied or unavailable.'); return }
    } else track.enabled = !track.enabled
    setMicrophoneOn(Boolean(track.enabled))
  }

  const toggleCamera = async () => {
    let track = media.current?.getVideoTracks()[0]
    if (!track) {
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } })
        track = camera.getVideoTracks()[0]
        media.current?.addTrack(track)
        if (!screen.current) await replaceTrack('video', track)
      } catch { setNotice('Camera permission was denied or unavailable.'); return }
    } else track.enabled = !track.enabled
    if (!screen.current) await replaceTrack('video', track.enabled ? track : null)
    setCameraOn(Boolean(track.enabled))
  }

  const toggleScreen = async () => {
    if (!data?.meeting.screenShareEnabled) return
    if (screen.current) { await restoreCamera(); return }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice('Screen sharing is not supported in this browser or device. Use a supported desktop browser.')
      return
    }
    try {
      const shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = shared.getVideoTracks()[0]
      if (!track) return
      screen.current = shared
      setSharing(true)
      track.onended = () => { void restoreCamera() }
      await replaceTrack('video', track)
    } catch { setNotice('Screen selection was cancelled or not permitted. Nothing is being shared.') }
  }

  const changeStatus = async (action: 'start' | 'end') => {
    if (!data?.access.canManage) return
    if (action === 'end' && !window.confirm('End this meeting for all participants?')) return
    setBusy(true)
    try {
      await api.post(`/meetings/${id}/${action}`)
      if (action === 'end') leave()
      await load()
      setNotice(action === 'start' ? 'Your meeting is live. Share this room link with approved attendees.' : 'Meeting ended for all participants.')
    } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Could not update meeting status.') }
    finally { setBusy(false) }
  }

  const saveSettings = async () => {
    if (!data?.access.canManage) return
    setBusy(true)
    try {
      await api.post(`/meetings/${id}/settings`, {
        title, maxParticipants: Number(capacity),
        chatEnabled: data.meeting.chatEnabled, screenShareEnabled: data.meeting.screenShareEnabled,
      })
      await load()
      setNotice('Meeting settings saved.')
    } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Unable to update settings.') }
    finally { setBusy(false) }
  }

  const send = async () => {
    if (!draft.trim() || !data?.meeting.chatEnabled) return
    const text = draft.trim()
    setDraft('')
    try {
      const { message } = await api.post<{ message: ChatRow }>(`/meetings/${id}/chat`, { body: text })
      setMessages((old) => old.some((row) => row.id === message.id) ? old : [...old.slice(-99), message])
    } catch (err) {
      setDraft(text)
      setError(err instanceof ApiClientError ? err.message : 'Message was not sent. Try again.')
    }
  }

  const moderate = async (message: ChatRow) => {
    try {
      await api.post(`/meetings/${id}/moderate`, { messageId: message.id, status: 'HIDDEN' })
      setMessages((old) => old.map((row) => row.id === message.id ? { ...row, status: 'HIDDEN' } : row))
    } catch { setNotice('Message moderation failed. Please retry.') }
  }

  const removeParticipant = async (peer: Peer) => {
    if (!data?.access.canManage || !peer.userId) return
    if (!window.confirm(`Remove ${peer.name} from this meeting? They will not be able to reconnect until restored.`)) return
    try {
      await api.post(`/meetings/${id}/remove-participant`, { userId: peer.userId })
      await load()
      setNotice(`${peer.name} was removed from the meeting.`)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not remove participant.')
    }
  }

  const restoreParticipant = async (userId: string) => {
    if (!data?.access.canManage) return
    try {
      await api.post(`/meetings/${id}/restore-participant`, { userId })
      await load()
      setNotice('Participant meeting access restored.')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not restore participant.')
    }
  }

  const shareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/#/meeting/' + id)
      setNotice('Meeting link copied. Invitees still need an approved RSVP or valid ticket.')
    } catch { setNotice('Unable to copy the link on this device.') }
  }

  const meeting = data?.meeting
  return <div className="mx-auto max-w-[1420px] space-y-5 px-3 py-5 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">iEventPlux • interactive events</p>
        <h1 className="mt-1 break-words text-xl font-extrabold sm:text-3xl">{meeting?.title || 'Group meeting'}</h1>
        {meeting && <p className="text-sm text-muted-foreground">{meeting.event.orgName} · {meeting.event.title}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(meeting ? '/event/' + meeting.event.slug : '/')}>Event page</Button>
        <Button variant="outline" size="sm" onClick={() => void shareLink()} disabled={!meeting}><Copy className="mr-2 size-4" /> Share invite</Button>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-4" /></Button>
      </div>
    </div>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex items-start gap-2 rounded-xl border bg-secondary/60 p-3 text-sm"><CheckCircle2 className="size-4 shrink-0 text-primary" />{notice}</div>}
    {!meeting ? <div className="rounded-2xl border p-10 text-center text-sm text-muted-foreground">Checking meeting access…</div> : <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${meeting.status === 'LIVE' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-secondary'}`}>{meeting.status === 'LIVE' ? 'Live meeting' : meeting.status === 'ENDED' ? 'Ended' : 'Waiting for host'}</span>
        <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1"><UsersRound className="size-4" /> {joined ? peers.length + 1 : 0} / {meeting.maxParticipants} in call</span>
        {data?.access.canManage && <span className="inline-flex items-center gap-1 text-primary"><ShieldCheck className="size-4" /> Host controls</span>}
      </div>

      {data?.access.canManage && meeting.status !== 'LIVE' && <Card className="rounded-2xl"><CardContent className="flex flex-wrap items-end gap-3 pt-5">
        <label className="min-w-[190px] flex-1 space-y-1 text-sm"><span className="font-medium">Meeting title</span><Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="w-32 space-y-1 text-sm"><span className="font-medium">Participants</span><select className="h-10 w-full rounded-lg border bg-background px-2" value={capacity} onChange={(e) => setCapacity(e.target.value)}>{[2,3,4,5,6].map((n) => <option value={n} key={n}>{n}</option>)}</select></label>
        <Button variant="outline" disabled={busy} onClick={() => void saveSettings()}>Save</Button>
        {['PUBLISHED', 'LIVE'].includes(meeting.event.status)
          ? <Button disabled={busy} onClick={() => void changeStatus('start')}><Play className="mr-2 size-4" /> Start meeting</Button>
          : <p className="text-xs text-muted-foreground">Event completed; group discussion remains available.</p>}
      </CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {meeting.status === 'LIVE' ? <div className="space-y-3">
          <div className="grid auto-rows-fr gap-3 sm:grid-cols-2">
            {joined ? <>
              <VideoTile name={user?.displayName || 'You'} stream={screen.current || media.current} local sharing={sharing} />
              {peers.map((peer) => <div key={peer.id} className="space-y-1">
                <VideoTile name={peer.name} stream={peer.stream} />
                {data?.access.canManage && peer.userId !== user?.id && <button type="button"
                  className="w-full rounded-lg border border-destructive/30 px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => void removeParticipant(peer)}>Remove participant</button>}
              </div>)}
            </> : <div className="col-span-full flex aspect-video flex-col items-center justify-center gap-4 rounded-2xl border bg-slate-950 px-6 text-center text-white">
              <UsersRound className="size-12 text-white/70" />
              <p className="max-w-md text-sm">Join this small-group call to speak, use your camera, share your screen, and chat with other approved attendees.</p>
              <Button disabled={!data?.access.canJoin || busy} onClick={() => void join()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}{busy ? 'Joining…' : 'Join meeting'}</Button>
              {!data?.access.canJoin && <p className="text-xs text-amber-200">An approved RSVP or valid ticket is required to join.</p>}
            </div>}
          </div>
          {joined && <div className="flex flex-wrap justify-center gap-2 rounded-2xl border bg-card p-3">
            <Button variant="outline" className="min-h-11" onClick={() => void toggleMicrophone()}>{microphoneOn ? <Mic className="mr-2 size-4" /> : <MicOff className="mr-2 size-4" />}{microphoneOn ? 'Mute' : 'Unmute'}</Button>
            <Button variant="outline" className="min-h-11" onClick={() => void toggleCamera()}>{cameraOn ? <Camera className="mr-2 size-4" /> : <CameraOff className="mr-2 size-4" />}{cameraOn ? 'Camera off' : 'Camera on'}</Button>
            {meeting.screenShareEnabled && <Button variant="outline" className="min-h-11" onClick={() => void toggleScreen()}>{sharing ? <MonitorX className="mr-2 size-4" /> : <MonitorUp className="mr-2 size-4" />}{sharing ? 'Stop sharing' : 'Share screen'}</Button>}
            <Button variant="destructive" className="min-h-11" onClick={() => leave()}><PhoneOff className="mr-2 size-4" /> Leave</Button>
            {data?.access.canManage && <Button variant="outline" className="min-h-11 border-destructive text-destructive" onClick={() => void changeStatus('end')}><Square className="mr-2 size-4" /> End for everyone</Button>}
          </div>}
          {data?.access.canManage && Boolean(data.removedParticipants?.length) && <div className="space-y-2 rounded-xl border bg-card p-3">
            <h3 className="text-sm font-semibold">Removed participants</h3>
            {data.removedParticipants?.map((row) => <div className="flex flex-wrap items-center justify-between gap-2 text-sm" key={row.userId}>
              <span className="truncate">{row.user.displayName}</span>
              <Button size="sm" variant="outline" onClick={() => void restoreParticipant(row.userId)}>Restore access</Button>
            </div>)}
          </div>}
          <p className="text-xs text-muted-foreground">Small-group mesh connection: up to six devices. Camera and screen capture require browser permission and HTTPS. TURN relay configuration is necessary for reliable calls across some networks. No recording is performed.</p>
        </div> : <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center">
          <UsersRound className="size-10 text-primary" aria-hidden />
          <p className="font-semibold">{meeting.status === 'ENDED' ? 'The video meeting has ended' : 'Waiting for the organizer to start the call'}</p>
          <p className="max-w-md text-sm text-muted-foreground">Group chat is available to authorized event attendees before and after the video call. New camera and screen sharing sessions start only when the host opens the room.</p>
        </div>}

        <Card className="flex min-h-[350px] flex-col overflow-hidden rounded-2xl lg:max-h-[70vh]">
          <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><MessageSquare className="size-5 text-primary" /> Meeting chat</div>
          <div className="min-h-[230px] flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
            {messages.filter((item) => item.status === 'VISIBLE' || data?.access.canManage).slice(-80).map((msg) => <div className="rounded-xl bg-secondary/60 p-2.5" key={msg.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold">{msg.user.displayName}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className={`mt-1 break-words text-sm ${msg.status === 'HIDDEN' ? 'italic text-muted-foreground' : ''}`}>{msg.status === 'HIDDEN' ? 'Message hidden by host' : msg.body}</p>
              {data?.access.canManage && msg.status === 'VISIBLE' && <button type="button" className="mt-1 text-xs text-destructive hover:underline" onClick={() => void moderate(msg)}>Hide</button>}
            </div>)}
            {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Welcome your group.</p>}
            <div ref={chatEnd} />
          </div>
          {meeting.chatEnabled ? <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send() }}>
            <Input aria-label="Meeting chat message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={700} placeholder="Message your event group…" />
            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send chat"><Send className="size-4" /></Button>
          </form> : <p className="border-t p-3 text-sm text-muted-foreground">Chat is disabled by the organizer.</p>}
        </Card>
      </div>
    </>}
  </div>
}
