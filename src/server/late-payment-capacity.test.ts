import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

// Guard against accidental reintroduction of the old read-then-increment
// pattern in late payment recovery. DB concurrency is verified separately.
describe('late payment reservation concurrency regression', () => {
  test('recovery uses conditional SQL update and rollback for exhausted tiers', () => {
    const code = readFileSync(new URL('./services/fulfilment.ts', import.meta.url), 'utf8')
    const recovery = code.slice(code.indexOf('const canReserve ='), code.indexOf('if (!canReserve)'))
    expect(recovery).toContain('UPDATE "TicketType"')
    expect(recovery).toContain('"soldCount" + "reservedCount" + ${item.qty} <= "quota"')
    expect(recovery).toContain('throw new LatePaymentCapacityUnavailable()')
    expect(recovery).toContain('error instanceof LatePaymentCapacityUnavailable')
    expect(recovery).not.toContain('reservedCount: { increment: item.qty }')
  })
})
