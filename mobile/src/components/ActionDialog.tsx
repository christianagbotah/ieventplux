import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** Themed native dialog: explicit destructive/consent actions, no silent changes. */
export type ActionPrompt = {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}

export function ActionDialog({ prompt, onDismiss, busy = false }: {
  prompt: ActionPrompt | null
  onDismiss: () => void
  busy?: boolean
}) {
  return <Modal transparent visible={Boolean(prompt)} animationType="fade"
    onRequestClose={() => { if (!busy) onDismiss() }}
    accessibilityViewIsModal>
    <View style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={styles.marker} />
        <Text style={styles.title}>{prompt?.title}</Text>
        <Text style={styles.description}>{prompt?.description}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onDismiss}
            style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy}
            accessibilityLabel={prompt?.confirmLabel || 'Confirm action'}
            onPress={() => prompt?.onConfirm()}
            style={[styles.confirm, prompt?.destructive && styles.danger, busy && styles.disabled]}>
            <Text style={styles.confirmText}>{busy ? 'Working…' : prompt?.confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  backdrop: { flex:1, justifyContent:'center', padding:22, backgroundColor:'rgba(7,27,19,0.66)' },
  panel: { borderRadius:22, padding:22, backgroundColor:theme.colors.card, gap:12,
    borderWidth:1,borderColor:theme.colors.border, elevation:8 },
  marker: { width:48, height:5, backgroundColor:theme.colors.primary, borderRadius:6, marginBottom:4 },
  title: { color:theme.colors.text, fontSize:19, fontWeight:'800', lineHeight:26 },
  description: { color:theme.colors.textMuted, fontSize:14, lineHeight:22 },
  actions: { flexDirection:'row', gap:10, justifyContent:'flex-end', marginTop:10 },
  cancel: { flex:1, minHeight:46, borderRadius:12, borderWidth:1, borderColor:theme.colors.border,
    alignItems:'center', justifyContent:'center' },
  cancelText: { fontSize:14, fontWeight:'700', color:theme.colors.text },
  confirm: { flex:1, minHeight:46, borderRadius:12, backgroundColor:theme.colors.primary,
    alignItems:'center', justifyContent:'center' },
  confirmText: { fontSize:14, fontWeight:'800', color:'#ffffff', textAlign:'center' },
  danger: { backgroundColor:theme.colors.danger },
  disabled: { opacity:0.6 },
})
