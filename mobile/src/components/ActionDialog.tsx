/** Premium native confirmation modal: shared for votes, moderation, consent. */
import {ActivityIndicator,Modal,Pressable,StyleSheet,Text,View} from 'react-native'
import {mobileDesign} from '../ui/PremiumUI'

export type ActionPrompt={
  title:string
  description:string
  confirmLabel:string
  destructive?:boolean
  onConfirm:()=>void
}

export function ActionDialog({prompt,onDismiss,busy=false}:{prompt:ActionPrompt|null;onDismiss:()=>void;busy?:boolean}){
  return <Modal transparent visible={Boolean(prompt)} animationType="fade"
    onRequestClose={()=>{if(!busy)onDismiss()}} accessibilityViewIsModal>
    <View style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={[styles.iconSurface,prompt?.destructive&&styles.iconSurfaceDanger]}>
          <Text style={[styles.icon,prompt?.destructive&&styles.iconDanger]}>{prompt?.destructive?'!':'✓'}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{prompt?.title}</Text>
        <Text style={styles.description}>{prompt?.description}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onDismiss} style={({pressed})=>[styles.cancel,pressed&&styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} accessibilityLabel={prompt?.confirmLabel||'Confirm action'}
            onPress={()=>prompt?.onConfirm()} style={({pressed})=>[styles.confirm,prompt?.destructive&&styles.danger,(busy||pressed)&&styles.pressed]}>
            {busy?<ActivityIndicator color="#fff" size="small"/>:<Text numberOfLines={2} style={styles.confirmText}>{prompt?.confirmLabel}</Text>}
          </Pressable>
        </View>
        <Text style={styles.note}>Your changes will be processed securely.</Text>
      </View>
    </View>
  </Modal>
}
const styles=StyleSheet.create({
  backdrop:{flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:20,backgroundColor:'rgba(9,21,33,.70)'},
  panel:{width:'100%',maxWidth:420,borderRadius:27,padding:23,backgroundColor:'#fff',gap:11,borderWidth:1,borderColor:mobileDesign.border,
    shadowColor:mobileDesign.shadow,shadowOpacity:.19,shadowRadius:24,shadowOffset:{width:0,height:12},elevation:12},
  iconSurface:{width:57,height:57,borderRadius:20,backgroundColor:mobileDesign.mintSoft,alignItems:'center',justifyContent:'center',marginBottom:5},
  iconSurfaceDanger:{backgroundColor:'#fff0eb'},icon:{color:mobileDesign.emerald,fontSize:27,fontWeight:'900'},iconDanger:{color:'#b34b3e'},
  title:{color:mobileDesign.ink,fontSize:22,fontWeight:'900',lineHeight:29,letterSpacing:-.55},
  description:{color:mobileDesign.inkMuted,fontSize:13,lineHeight:22},
  actions:{flexDirection:'row',gap:10,marginTop:12},
  cancel:{flex:1,minHeight:52,borderRadius:16,borderWidth:1,borderColor:mobileDesign.border,alignItems:'center',justifyContent:'center',padding:8},
  cancelText:{fontSize:13,fontWeight:'900',color:mobileDesign.ink},
  confirm:{flex:1,minHeight:52,borderRadius:16,backgroundColor:mobileDesign.emerald,alignItems:'center',justifyContent:'center',paddingHorizontal:9},
  confirmText:{fontSize:12,fontWeight:'900',color:'#fff',textAlign:'center',lineHeight:17},
  danger:{backgroundColor:'#bb4943'},pressed:{opacity:.67},
  note:{fontSize:10,color:mobileDesign.inkSoft,textAlign:'center',marginTop:3},
})
