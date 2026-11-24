/** True native video only for public, approved MP4 files from our own media
 * route. Existing poster-only event previews remain static and clearly labelled.
 * No autoplay in the background, while on another tab, or off-screen.
 */
import {useEffect,useState} from 'react'
import {Image,Pressable,StyleSheet,Text,View} from 'react-native'
import {useVideoPlayer,VideoView} from 'expo-video'
import {absoluteUrl,type NativeEventClip} from '../api/client'
import {PremiumBackdrop,mobileDesign} from '../ui/PremiumUI'
import {trustedReelVideoUrl,visibleReelMayPlay} from '../lib/reel-playback'

const imagePoster=(value:string|null|undefined):string|null =>
  value && /\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i.test(value) ? absoluteUrl(value):null

export function VerifiedReelMedia({clip,active}:{clip:NativeEventClip;active:boolean}){
  const source=trustedReelVideoUrl(clip.url)
  const poster=imagePoster(clip.posterUrl)
  // Do not instantiate players or download media for off-screen cards.
  if(!source||!active)return <View style={StyleSheet.absoluteFillObject}>
    {poster?<Image source={{uri:poster}} style={styles.cover} resizeMode="cover" accessibilityLabel={clip.event.title+' event poster'}/>:
      <PremiumBackdrop mode="midnight"/>}
  </View>
  return <PublishedReelVideo key={clip.id} source={source} poster={poster} title={clip.event.title} active={active}/>
}

function PublishedReelVideo({source,poster,title,active}:{source:string;poster:string|null;title:string;active:boolean}){
  const [muted,setMuted]=useState(true)
  const [userPaused,setUserPaused]=useState(false)
  const [status,setStatus]=useState<'idle'|'loading'|'readyToPlay'|'error'>('loading')
  const player=useVideoPlayer(source,p=>{
    p.loop=true
    p.muted=true
    p.staysActiveInBackground=false
    p.audioMixingMode='mixWithOthers'
  })
  useEffect(()=>{
    const sub=player.addListener('statusChange',event=>setStatus(event.status))
    return()=>sub.remove()
  },[player])
  useEffect(()=>{player.muted=muted},[player,muted])
  const shouldPlay=visibleReelMayPlay({videoUrl:source,clipId:'video',visibleClipId:active?'video':null,
    screenFocused:active,appActive:active,userPaused})
  useEffect(()=>{
    if(shouldPlay&&status!=='error')player.play()
    else player.pause()
    return()=>player.pause()
  },[player,shouldPlay,status])
  const displayPoster=(!active||status!=='readyToPlay')&&Boolean(poster)
  return <View style={StyleSheet.absoluteFillObject}>
    <VideoView player={player} style={styles.cover} contentFit="cover" nativeControls={false} allowsFullscreen={false}/>
    {displayPoster&&poster?<Image source={{uri:poster}} style={styles.cover} resizeMode="cover" accessibilityLabel={title+' video poster'}/>:null}
    {status==='error'?<View style={styles.errorShade}><Text style={styles.errorTitle}>Video temporarily unavailable</Text><Text style={styles.errorBody}>Open the event to view available photos and details.</Text></View>:null}
    <View style={styles.controlColumn}>
      <Pressable accessibilityRole="button" accessibilityLabel={muted?'Turn on reel sound':'Mute reel sound'}
        onPress={()=>setMuted(v=>!v)} style={styles.control}><Text style={styles.symbol}>{muted?'◌':'◉'}</Text>
        <Text style={styles.controlText}>{muted?'Sound off':'Sound on'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={userPaused?'Play reel video':'Pause reel video'}
        onPress={()=>setUserPaused(v=>!v)} style={styles.control}><Text style={styles.symbol}>{userPaused?'▶':'Ⅱ'}</Text>
        <Text style={styles.controlText}>{userPaused?'Play':'Pause'}</Text></Pressable>
    </View>
    {status==='loading'&&active?<View style={styles.bufferHint} pointerEvents="none"><Text style={styles.bufferText}>Loading video…</Text></View>:null}
  </View>
}

const styles=StyleSheet.create({
  cover:{width:'100%',height:'100%',position:'absolute',left:0,right:0,top:0,bottom:0},
  controlColumn:{position:'absolute',right:14,top:62,alignItems:'center',gap:10},
  control:{minWidth:75,minHeight:54,backgroundColor:'#0d2238a9',borderWidth:1,borderColor:'#ffffff88',borderRadius:16,
    alignItems:'center',justifyContent:'center',gap:1,paddingHorizontal:8,paddingVertical:6},
  symbol:{color:'#fff',fontSize:18,fontWeight:'900'},controlText:{color:'#fff',fontSize:9,fontWeight:'900'},
  bufferHint:{position:'absolute',top:'45%',alignSelf:'center',backgroundColor:'#0b202fc0',paddingHorizontal:13,paddingVertical:8,borderRadius:12},
  bufferText:{color:'#fff',fontSize:11,fontWeight:'900'},
  errorShade:{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',
    backgroundColor:'#051b28cc',padding:25},
  errorTitle:{color:'#fff',fontSize:15,fontWeight:'900',textAlign:'center'},
  errorBody:{color:'#d1e4df',fontSize:11,textAlign:'center',marginTop:8,lineHeight:18},
})
