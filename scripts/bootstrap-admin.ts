/**
 * One-time, INTERACTIVE production super-admin bootstrap for an EMPTY database.
 *
 * This command deliberately refuses demo accounts, existing users and non-TTY
 * password input. Never put a password on the command line or in .env.
 *
 *   NODE_ENV=production BOOTSTRAP_ADMIN_EMAIL=operator@example.com \
 *     BOOTSTRAP_ADMIN_NAME="Platform Administrator" bun run ops:bootstrap-admin
 */
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { productionSecretConfigured } from '../src/server/hubtel/security-policy'

function usage() {
  console.log('Usage: NODE_ENV=production BOOTSTRAP_ADMIN_EMAIL=<email> [BOOTSTRAP_ADMIN_NAME=<name>] bun run ops:bootstrap-admin')
  console.log('Requires an EMPTY PostgreSQL database and an interactive terminal. Password is prompted with echo disabled.')
}

function requireEmail(value: string | undefined): string {
  const email = value?.trim().toLowerCase() ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to a valid admin email address.')
  }
  if (email.endsWith('.dev') || email.endsWith('.local') || email.endsWith('.example')) {
    throw new Error('Do not use demo or local domains for the production administrator.')
  }
  return email
}

function validatePassword(password: string, email: string): void {
  if (password.length < 16 || password.length > 256) throw new Error('Password must be 16–256 characters.')
  if (/dev@12345|password|changeme|12345678|qwerty/i.test(password)) throw new Error('Password contains a known insecure pattern.')
  if (password.toLowerCase().includes(email.split('@')[0])) throw new Error('Password cannot contain the admin email local-part.')
}

function hiddenPrompt(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const muted = new Writable({ write(_chunk, _encoding, callback) { callback() } })
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true })
    process.stdout.write(prompt)
    rl.once('SIGINT', () => {
      rl.close()
      process.stdout.write('\n')
      reject(new Error('Cancelled by operator.'))
    })
    rl.question('', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { usage(); return }
  if (process.env.NODE_ENV !== 'production') throw new Error('Refusing bootstrap unless NODE_ENV=production.')
  if (!productionSecretConfigured(process.env.APP_SECRET)) throw new Error('Configure a unique production APP_SECRET first.')
  if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('The production DATABASE_URL must be PostgreSQL.')
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive TTY required for hidden password input.')
  const email = requireEmail(process.env.BOOTSTRAP_ADMIN_EMAIL)
  const displayName = (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Platform Administrator').trim()
  if (!displayName || displayName.length > 120) throw new Error('Invalid BOOTSTRAP_ADMIN_NAME.')
  console.log('Bootstrap target: ' + email + ' (SUPER_ADMIN)')
  console.log('This is a ONE-TIME action for an empty database only; it creates no demo identities.')
  const password = await hiddenPrompt('New admin password (hidden): ')
  validatePassword(password, email)
  const confirm = await hiddenPrompt('Confirm password (hidden): ')
  if (confirm !== password) throw new Error('Password confirmation did not match.')

  const { PrismaClient } = await import('@prisma/client')
  const bcrypt = await import('bcryptjs')
  const db = new PrismaClient()
  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const created = await db.$transaction(async (tx) => {
      // Serialize concurrent bootstrap attempts on this PostgreSQL database.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(32605235)`
      const count = await tx.user.count()
      if (count !== 0) throw new Error('Production bootstrap REFUSED: database already has users. Use an audited recovery process instead.')
      return tx.user.create({
        data: {
          email,
          displayName,
          passwordHash,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
        select: { id: true, email: true, role: true },
      })
    })
    console.log('CREATED: ' + created.role + ' ' + created.email + ' (' + created.id + ')')
    console.log('Verify admin login and email ownership before enabling live ticket sales.')
  } finally {
    await db.$disconnect()
  }
}
main().catch((err) => {
  console.error('Bootstrap aborted:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
