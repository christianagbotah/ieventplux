import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const qaScripts = [
  'merchandise-isolated-qa.ts',
  'merchandise-route-qa.ts',
  'merchandise-scanner-route-qa.ts',
  'merchandise-report-route-qa.ts',
  'merchandise-report-qa.ts',
  'souvenir-return-isolated-qa.ts',
]

describe('scratch merchandise QA import order', () => {
  for (const filename of qaScripts) {
    test(filename + ' verifies scratch database before importing Prisma-backed services', () => {
      const code = readFileSync(new URL(filename, import.meta.url), 'utf8')
      expect(code).toContain('await requireIsolatedMerchandiseQaDatabase()')
      const guard = code.indexOf('await requireIsolatedMerchandiseQaDatabase()')
      const forbidden = /^(?!\s*\/\/).*\bfrom\s+['"]\.\.\/src\/(?:lib\/db|server\/(?:auth|services\/))/m
      expect(forbidden.test(code)).toBe(false)
      const serviceImports = [...code.matchAll(/await import\(['"]\.\.\/src\/(?:lib\/db|server\/(?:auth|services\/))[^'"]*['"]\)/g)]
      expect(serviceImports.length).toBeGreaterThan(0)
      expect(serviceImports.every((match) => (match.index ?? 0) > guard)).toBe(true)
    })
  }
})
