/** Keep the verification secret out of the URL, logs and browser history. */
export function verificationEmailBody(appUrl: string, code: string): string {
  const link = appUrl.replace(/\/$/, '') + '/#/verify-email'
  return `Verify your iEventPlux email address. Open ${link} and enter the code ${code}. This code expires in 30 minutes. If you did not request it, ignore this email.`
}
