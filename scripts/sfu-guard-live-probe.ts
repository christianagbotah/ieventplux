/**
 * Disposable integration fixture for the iEventPlux SFU guard.
 * Creates ONLY an empty synthetic room with no event/database record.
 * Modes: create | inspect | cleanup. Never touches real events/users.
 */
import { randomBytes } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { RoomServiceClient } from 'livekit-server-sdk'

async function main() {
  const mode = process.argv[2]
  const path = '/home/lightworld/private/ieventplux/media/sfu-guard-probe-name-20261121'
  const url = process.env.MEETING_SFU_INTERNAL_HTTP_URL || ''
  const key = process.env.MEETING_SFU_API_KEY || ''
  const secret = process.env.MEETING_SFU_API_SECRET || ''
  if (!url.startsWith('http://127.0.0.1:') || !key || secret.length < 32 ||
      process.env.IEVENTPLUX_MEETING_MEDIA_ENGINE !== 'sfu') {
    throw new Error('Probe requires this VPS protected loopback SFU configuration.')
  }
  const client = new RoomServiceClient(url, key, secret)
  if (mode === 'create') {
    const name = 'ieventplux-meeting-guardprobe' + randomBytes(7).toString('hex')
    const room = await client.createRoom({ name, maxParticipants: 0, emptyTimeout: 300 })
    if (room.name !== name) throw new Error('Synthetic room name mismatch.')
    await writeFile(path, name, { flag: 'wx', mode: 0o600 })
    console.log('PASS synthetic empty SFU meeting fixture created.')
    return
  }
  if (mode !== 'inspect' && mode !== 'cleanup') throw new Error('Usage: create | inspect | cleanup')
  const name = (await readFile(path, 'utf8')).trim()
  if (!/^ieventplux-meeting-guardprobe[a-f0-9]{14}$/.test(name)) throw new Error('Unsafe synthetic room name')
  const exists = (await client.listRooms([name])).some((room) => room.name === name)
  console.log('Synthetic guard-probe room still present:', exists)
  if (mode === 'cleanup') {
    if (exists) await client.deleteRoom(name)
    await unlink(path)
    console.log('PASS synthetic guard room fixture cleaned up.')
  } else if (mode === 'inspect') {
    process.exitCode = exists ? 0 : 2
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'SFU guard probe failed')
  process.exitCode = 1
})
