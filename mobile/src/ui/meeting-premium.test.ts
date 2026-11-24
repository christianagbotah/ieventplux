import {test,expect} from 'bun:test'
import {readFileSync} from 'node:fs'
const screen=(name:string)=>readFileSync(new URL(`../screens/${name}.tsx`,import.meta.url),'utf8')

test('native meeting entry uses branded React Native screens and system OS permission hooks',()=>{
  const code=screen('MeetingAccessScreen')
  expect(code).toContain('PremiumBackdrop')
  expect(code).toContain('mobileDesign')
  expect(code).toContain('useCameraPermissions()')
  expect(code).toContain('useMicrophonePermissions()')
  expect(code).toContain('api.meetings.joinCredentials(meeting.id)')
  expect(code).toContain("navigation.navigate('NativeMeeting'")
  expect(code).not.toContain('Alert.alert')
  expect(code).not.toContain('<WebView')
})
test('in-call camera and mic toggles ask native OS permissions when enabled from listener state',()=>{
  const code=screen('NativeMeetingRoom')
  expect(code).toContain('const [cameraAccess,requestCamera] = useCameraPermissions()')
  expect(code).toContain('const [micAccess,requestMicrophone] = useMicrophonePermissions()')
  expect(code).toContain('await requestCamera()')
  expect(code).toContain('await requestMicrophone()')
  expect(code).toContain('await room.localParticipant.setCameraEnabled(turnOn)')
  expect(code).toContain('await room.localParticipant.setMicrophoneEnabled(turnOn)')
  expect(code).toContain('api.meetings.detail(meetingId)')
})
test('native meeting keeps paginated tiles without restricting the server participant count',()=>{
  const code=screen('NativeMeetingRoom')
  expect(code).toContain('const VISIBLE_TILES = 8')
  expect(code).toContain('tracks.slice(current * VISIBLE_TILES')
  expect(code).toContain('participants.length.toLocaleString')
  expect(code).not.toContain('participants.slice(0,8)')
  expect(code).toContain('onDisconnected={leave}')
})
