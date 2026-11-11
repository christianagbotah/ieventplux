/**
 * Login — POST /api/v1/auth/login.
 *
 * Session note (honest adaptation, see src/api/client.ts): the API sets an
 * httpOnly cookie session (`ievx_session`). On the client this flow relies on
 * React Native's native cookie jar + `credentials: 'include'`; there is no
 * Bearer token to store today, so SecureStore token storage stays empty until
 * a mobile session-token endpoint exists server-side.
 */

import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, ApiClientError, isBaseUrlConfigured } from '../api/client'
import { theme } from '../theme'
import { useSession } from '../store/session'
import type { LoginScreenProps } from '../navigation'

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { signIn } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await api.auth.login(normalizedEmail, password)
      signIn(res.user, res.memberships)
      navigation.replace('Discover')
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? `${err.code}: ${err.message}`
          : 'Sign-in failed. Check your connection and the API base URL.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <Text style={styles.brandMark}>iEventPlux</Text>
            <Text style={styles.brandSub}>Events · Tickets · Live — Light World</Text>
          </View>

          {!isBaseUrlConfigured() ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>API base URL not configured</Text>
              <Text style={styles.warningBody}>
                Set EXPO_PUBLIC_API_BASE_URL (or app.json expo.extra.apiBaseUrl) to your
                iEventPlux web deployment, then restart the dev server.
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.textMuted}
            editable={!busy}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={theme.colors.textMuted}
            editable={!busy}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <Text style={styles.footnote}>
            Discovery is public, but tickets, orders and check-in require an account.
            Sessions use the same cookie credential as the web app (see src/api/client.ts).
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: theme.spacing.xl, justifyContent: 'center' },
  brandBlock: { alignItems: 'center', marginBottom: theme.spacing.xxl },
  brandMark: { fontSize: 34, fontWeight: '700', color: theme.colors.primary },
  brandSub: { marginTop: theme.spacing.xs, color: theme.colors.textMuted, fontSize: 13 },
  warningBox: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  warningTitle: { color: '#92400e', fontWeight: '700', marginBottom: theme.spacing.xs },
  warningBody: { color: '#92400e', fontSize: 12 },
  label: { color: theme.colors.text, fontWeight: '600', marginBottom: theme.spacing.xs },
  input: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    color: theme.colors.text,
    fontSize: 16,
  },
  error: { color: theme.colors.danger, marginBottom: theme.spacing.lg },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  footnote: {
    marginTop: theme.spacing.xl,
    color: theme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
})
