/** Premium native confirmation modal: shared for votes, moderation, consent. */
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native'
import {mobileDesign} from '../ui/PremiumUI'

export type ActionPrompt={
  title:string
  description:string
  confirmLabel:string
  destructive?:boolean
  onConfirm:()=>void
}

export function ActionDialog({prompt,onDismiss,busy=false}:{prompt:ActionPrompt|null;onDismiss:()=>void;busy?:boolean}){
  const {fontScale,width}=useWindowDimensions()
  const stacked=fontScale>=1.3||width<360
  return <Modal transparent visible={Boolean(prompt)} animationType="fade"
    onRequestClose={()=>{if(!busy)onDismiss()}} accessibilityViewIsModal>
    <View style={styles.backdrop}>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent} bounces={false}>
        <View style={[styles.iconSurface,prompt?.destructive&&styles.iconSurfaceDanger]}>
          <Text style={[styles.icon,prompt?.destructive&&styles.iconDanger]}>{prompt?.destructive?'!':'✓'}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{prompt?.title}</Text>
        <Text style={styles.description}>{prompt?.description}</Text>
        <View style={[styles.actions,stacked&&styles.actionsStacked]}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onDismiss} style={({pressed})=>[styles.cancel,pressed&&styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={prompt?.confirmLabel||'Confirm action'}
            onPress={()=>prompt?.onConfirm()} style={({pressed})=>[styles.confirm,prompt?.destructive&&styles.danger,(busy||pressed)&&styles.pressed]}>
            {busy?<ActivityIndicator color="#fff" size="small"/>:<Text style={styles.confirmText}>{prompt?.confirmLabel}</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  </Modal>
}
const styles=StyleSheet.create({
  backdrop:{flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:20,backgroundColor:'rgba(9,21,33,.70)'},
  panel:{width:'100%',maxWidth:420,borderRadius:24,maxHeight:'85%',flexGrow:0,backgroundColor:'#fff',borderWidth:1,borderColor:mobileDesign.border,
    shadowColor:mobileDesign.shadow,shadowOpacity:.19,shadowRadius:24,shadowOffset:{width:0,height:12},elevation:12},
  panelContent:{padding:20,gap:10},
  iconSurface:{width:44,height:44,borderRadius:14,backgroundColor:mobileDesign.mintSoft,alignItems:'center',justifyContent:'center',marginBottom:5},
  iconSurfaceDanger:{backgroundColor:'#fff0eb'},icon:{color:mobileDesign.emerald,fontSize:22,fontWeight:'700'},iconDanger:{color:'#b34b3e'},
  title:{color:mobileDesign.ink,fontSize:20,fontWeight:'700',lineHeight:26,letterSpacing:-.55},
  description:{color:mobileDesign.inkMuted,fontSize:14,lineHeight:21},
  actions:{flexDirection:'row',gap:10,marginTop:12},actionsStacked:{flexDirection:'column'},
  cancel:{flex:1,minHeight:48,borderRadius:12,borderWidth:1,borderColor:mobileDesign.border,alignItems:'center',justifyContent:'center',padding:8},
  cancelText:{fontSize:14,fontWeight:'600',color:mobileDesign.ink},
  confirm:{flex:1,minHeight:48,borderRadius:12,backgroundColor:mobileDesign.emerald,alignItems:'center',justifyContent:'center',paddingHorizontal:9},
  confirmText:{fontSize:14,fontWeight:'600',color:'#fff',textAlign:'center',lineHeight:20},
  danger:{backgroundColor:'#a72b25'},pressed:{opacity:.67},
})
