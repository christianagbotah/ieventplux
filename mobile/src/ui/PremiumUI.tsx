/**
 * iEventPlux mobile visual foundation.
 * Screens remain genuine React Native views, not embedded web pages.
 * Colors and content semantics are aligned with the responsive web portal.
 */
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { theme } from '../theme'

export const mobileDesign = {
  ink:'#142231', inkMuted:'#5c6d7e', inkSoft:'#59697b',
  forest:'#073e3b', forestDeep:'#091f31', emerald:'#087a6d', mint:'#c6f6dd',
  mintSoft:'#e9f7f2', gold:'#f2c879', white:'#ffffff', canvas:'#f5f7fa',
  border:'#d7dfe7', shadow:'#11253f',
  radius:{sm:10,md:14,lg:18,xl:24},
  layout:{edge:16,section:24,card:14},
} as const

/** Decorative premium gradient is scalable SVG, independent of device pixel ratio. */
export function PremiumBackdrop({mode='emerald'}:{mode?:'emerald'|'midnight'|'ocean'}){
  const dark=mode==='midnight'
  const blue=mode==='ocean'
  return <View style={styles.backdrop} pointerEvents="none" accessibilityElementsHidden>
    <Svg width="100%" height="100%" viewBox="0 0 420 420" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="ievent-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={dark?'#101d37':blue?'#092f45':'#073a39'}/>
          <Stop offset="0.52" stopColor={dark?'#193a4d':blue?'#095b6a':'#087a6d'}/>
          <Stop offset="1" stopColor={dark?'#074a48':blue?'#087a6d':'#0b695d'}/>
        </LinearGradient>
        <LinearGradient id="ievent-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#c2ffe0" stopOpacity="0.30"/>
          <Stop offset="1" stopColor="#e9c380" stopOpacity="0"/>
        </LinearGradient>
      </Defs>
      <Rect width="420" height="420" fill="url(#ievent-bg)" />
      <Circle cx="367" cy="6" r="209" fill="url(#ievent-glow)" />
      <Circle cx="379" cy="2" r="127" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1" />
      <Circle cx="379" cy="2" r="176" fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" />
      <Circle cx="379" cy="2" r="225" fill="none" stroke="#ffffff" strokeOpacity="0.075" strokeWidth="1" />
      <Path d="M0 336 Q104 296 212 367 T420 340 V420 H0 Z" fill="#053a44" opacity="0.17" />
      <Path d="M0 385 Q145 345 268 402 T420 368" fill="none" stroke="#e7fbf3" strokeWidth="1" strokeOpacity="0.13" />
      <Circle cx="350" cy="96" r="5" fill="#f4d699" fillOpacity="0.72"/>
      <Circle cx="330" cy="139" r="2.5" fill="#e4fff0" fillOpacity="0.62"/>
    </Svg>
  </View>
}

export function SectionHeading({eyebrow,title,subtitle,action,onAction}:{
  eyebrow?:string; title:string; subtitle?:string; action?:string;onAction?:()=>void
}){
  return <View style={styles.sectionHeading}>
    <View style={styles.sectionMain}>
      {eyebrow?<Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>:null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle?<Text style={styles.sectionSubtitle}>{subtitle}</Text>:null}
    </View>
    {action&&onAction?<Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{action}  ›</Text></Pressable>:null}
  </View>
}

export function SurfaceCard({children,style,padding=14}:{children:ReactNode;style?:ViewStyle;padding?:number}){
  return <View style={[styles.card,{padding},style]}>{children}</View>
}

export function PremiumButton({label,onPress,secondary=false,disabled=false,wide=false}:{
  label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;wide?:boolean
}){
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityLabel={label} accessibilityState={{disabled}} onPress={onPress}
    style={({pressed})=>[styles.button,secondary&&styles.buttonAlt,wide&&styles.buttonWide,(disabled||pressed)&&{opacity:.72}]}>
    <Text style={[styles.buttonText,secondary&&styles.buttonAltText]}>{label}</Text>
  </Pressable>
}

export function LabelPill({label,tone='mint'}:{label:string;tone?:'mint'|'cream'|'light'|'red'}){
  return <View style={[styles.label,{backgroundColor:tone==='cream'?'#fff4da':tone==='light'?'#eef1f7':tone==='red'?'#ffedeb':mobileDesign.mintSoft}]}>
    <Text style={[styles.labelText,{color:tone==='red'?'#af3e39':tone==='cream'?'#8d5f14':tone==='light'?mobileDesign.inkMuted:mobileDesign.emerald}]}>{label}</Text>
  </View>
}

export function TileGlyph({kind,size=46}:{kind:'ticket'|'event'|'organizer'|'store'|'scanner'|'settings'|'spark';size?:number}){
  const d=size*.47
  return <View style={[styles.glyphBox,{height:size,width:size,borderRadius:size*.32}]}>
    <Svg height={d} width={d} viewBox="0 0 24 24" fill="none" stroke={mobileDesign.emerald} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {kind==='ticket'?<Path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5zm10 0v2m0 4v2m0 4v2"/>:
        kind==='event'?<><Rect x="3" y="5" width="18" height="16" rx="3"/><Path d="M7 3v4m10-4v4M3 11h18m-13 5h4"/></>:
        kind==='organizer'?<><Circle cx="9" cy="8" r="3"/><Path d="M2.7 20c0-4 2.2-6 6.3-6s6.5 2 6.5 6M17 6a3 3 0 0 1 0 6m.5 2c2 .6 3 2.5 3 6"/></>:
        kind==='store'?<><Path d="M4 9 6 4h12l2 5v11H4V9zm0 0h16M9 20v-7h6v7"/></>:
        kind==='scanner'?<Path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4M4 12h16M8 9v6m8-6v6"/>:
        kind==='settings'?<><Circle cx="12" cy="12" r="3"/><Path d="M10 3h4l.6 2.5L17 7l2.5-.7 2 3.5-1.9 1.8v2l1.9 1.8-2 3.5-2.5-.7-2.4 1.5L14 22h-4l-.6-2.3L7 18.2l-2.5.7-2-3.5 1.9-1.8v-2L2.5 9.8l2-3.5L7 7l2.4-1.5z"/></>:
        <><Path d="m12 2 1.9 6.2L20 10l-6.1 1.8L12 18l-1.9-6.2L4 10l6.1-1.8L12 2zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/></>}
    </Svg>
  </View>
}

const styles=StyleSheet.create({
  backdrop:{position:'absolute',top:0,left:0,right:0,bottom:0},
  sectionHeading:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:10,marginBottom:10},
  sectionMain:{flex:1},eyebrow:{fontSize:theme.typography.caption,fontWeight:'700',letterSpacing:.65,color:mobileDesign.emerald,marginBottom:5},
  sectionTitle:{fontSize:theme.typography.title,letterSpacing:-.4,lineHeight:theme.typography.titleLine,fontWeight:'700',color:mobileDesign.ink},
  sectionSubtitle:{fontSize:theme.typography.body,lineHeight:theme.typography.bodyLine,color:mobileDesign.inkMuted,marginTop:5},
  sectionAction:{paddingHorizontal:10,minHeight:theme.touch.compact,justifyContent:'center',backgroundColor:mobileDesign.mintSoft,borderRadius:13},
  sectionActionText:{color:mobileDesign.emerald,fontWeight:'700',fontSize:theme.typography.label},
  card:{backgroundColor:mobileDesign.white,borderRadius:mobileDesign.radius.lg,borderWidth:1,borderColor:mobileDesign.border,
    shadowColor:mobileDesign.shadow,shadowOpacity:.035,shadowOffset:{width:0,height:8},shadowRadius:20,elevation:2},
  button:{minHeight:theme.touch.standard,borderRadius:12,backgroundColor:mobileDesign.emerald,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},
  buttonAlt:{backgroundColor:mobileDesign.mintSoft,borderWidth:1,borderColor:'#d1eadf'},buttonWide:{flex:1},
  buttonText:{color:'#fff',fontSize:theme.typography.action,fontWeight:'700',textAlign:'center'},buttonAltText:{color:mobileDesign.emerald},
  label:{paddingHorizontal:9,paddingVertical:4,borderRadius:999,alignSelf:'flex-start'},
  labelText:{fontSize:theme.typography.caption,fontWeight:'700',letterSpacing:.25},
  glyphBox:{backgroundColor:mobileDesign.mintSoft,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#d7ede4'},
})
