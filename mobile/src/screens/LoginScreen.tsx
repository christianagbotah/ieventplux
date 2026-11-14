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
  const [success, setSuccess] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetCodeSent, setResetCodeSent] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)

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

  const startReset = async () => {
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setError('Enter your email to request a password reset.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await api.auth.requestReset(normalized)
      setResetCodeSent(true)
      setSuccess('If this account exists, a reset code has been sent. Check your email.')
      // The development API may expose a labelled test code; never fabricate a
      // code or claim email delivery when a live SMTP provider is unavailable.
      if (result.devResetCode) setSuccess(`DEV TEST CODE: ${result.devResetCode} — email delivery not configured.`)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reset request failed. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const finishReset = async () => {
    if (!resetCode.trim() || resetPassword.length < 8) {
      setError('Enter your reset code and a new password with at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.auth.confirmReset(email.trim().toLowerCase(), resetCode.trim(), resetPassword)
      setResetMode(false)
      setResetCodeSent(false)
      setResetCode('')
      setResetPassword('')
      setPassword('')
      setSuccess('Password updated. Sign in with your new password.')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reset password.')
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
            <Text style={styles.brandSub}>Experiences · Tickets · Live — Lightworld Technologies</Text>
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

          {resetMode ? (
            <>
              {resetCodeSent ? (
                <>
                  <Text style={styles.label}>Reset code</Text>
                  <TextInput
                    style={styles.input}
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder="Enter the code from your email"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    editable={!busy}
                    accessibilityLabel="Password reset code"
                  />
                  <Text style={styles.label}>New password</Text>
                  <View style={styles.passwordWrap}>
                    <TextInput
                      style={styles.passwordField}
                      value={resetPassword}
                      onChangeText={setResetPassword}
                      secureTextEntry={!showResetPassword}
                      placeholder="At least 8 characters"
                      placeholderTextColor={theme.colors.textMuted}
                      editable={!busy}
                      accessibilityLabel="New password"
                    />
                    <Pressable style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={showResetPassword ? 'Hide new password' : 'Show new password'} onPress={() => setShowResetPassword((value) => !value)}>
                      <Text style={styles.eyeText}>{showResetPassword ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.resetHint}>Enter your email and we will send a verification code. Resetting a password revokes existing sessions.</Text>
              )}
              {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
              {success ? <Text style={styles.success} accessibilityLiveRegion="polite">{success}</Text> : null}
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={() => void (resetCodeSent ? finishReset() : startReset())}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={resetCodeSent ? 'Set new password' : 'Send reset code'}
              >
                {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>{resetCodeSent ? 'Update password' : 'Send reset code'}</Text>}
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => { setResetMode(false); setError(null); setSuccess(null) }} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordField}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.textMuted}
                  editable={!busy}
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                />
                <Pressable style={styles.eyeButton} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)}>
                  <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              <Pressable style={styles.forgotButton} onPress={() => { setResetMode(true); setError(null); setSuccess(null) }} accessibilityRole="button" accessibilityLabel="Forgot password">
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>

              {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
              {success ? <Text style={styles.success} accessibilityLiveRegion="polite">{success}</Text> : null}

              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={() => void submit()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign in</Text>}
              </Pressable>
            </>
          )}

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
  container: { flexGrow: 1, padding: theme.spacing.xl, justifyContent: 'center', maxWidth: 560, alignSelf: 'center', width: '100%' },
  brandBlock: { alignItems: 'center', marginBottom: theme.spacing.xxl },
  brandMark: { fontSize: 36, fontWeight: '800', color: theme.colors.primary, letterSpacing: -0.8 },
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
  error: { color: theme.colors.danger, fontSize: 13, marginBottom: theme.spacing.lg },
  success: { color: theme.colors.primaryDark, fontSize: 13, marginBottom: theme.spacing.lg, lineHeight: 19 },
  resetHint: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: theme.spacing.lg },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: theme.spacing.md },
  passwordField: { flex: 1, padding: theme.spacing.lg, color: theme.colors.text, fontSize: 16, minHeight: 52 },
  eyeButton: { minWidth: 55, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  eyeText: { color: theme.colors.primaryDark, fontWeight: '800', fontSize: 12 },
  forgotButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginBottom: theme.spacing.sm },
  forgotText: { color: theme.colors.primaryDark, fontWeight: '700', fontSize: 13 },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md },
  secondaryButtonText: { color: theme.colors.primaryDark, fontSize: 14, fontWeight: '700' },
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
