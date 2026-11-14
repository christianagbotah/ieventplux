/**
 * Ambient types for Bun's built-in test runner module `bun:test`.
 *
 * Why this file exists: the project runs its unit tests with `bun test`
 * directly (no Jest, no @types/bun, no other test-runner dependency), but
 * `bunx tsc --noEmit` still type-checks every file under src/ — including the
 * .test.ts files that import from 'bun:test'. This declaration describes just
 * the surface those tests actually use. It is hand-written, not generated:
 * if Bun's real API ever drifts from this, the failing test run (not the
 * type-check) is what will say so.
 */

declare module 'bun:test' {
  type TestFn = () => void | Promise<void>

  interface Matchers {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toStrictEqual(expected: unknown): void
    toBeNull(): void
    toBeUndefined(): void
    toBeDefined(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toContain(expected: unknown): void
    toHaveLength(length: number): void
    toBeGreaterThan(n: number): void
    toBeGreaterThanOrEqual(n: number): void
    toBeLessThan(n: number): void
    toMatch(expected: string | RegExp): void
    toThrow(expected?: string | RegExp | Error): void
    /** Inverted-match view (`expect(x).not.toBeNull()`). */
    not: Matchers
    /** Awaits the actual then applies matchers to the resolved value. */
    resolves: Matchers
    /** Awaits the actual (rejecting) then applies matchers to the rejection. */
    rejects: Matchers
  }

  export function expect(actual: unknown, message?: string): Matchers

  export function test(name: string, fn: TestFn): void
  export function test(name: string, options: { timeout?: number; only?: boolean; skip?: boolean; todo?: boolean }, fn: TestFn): void
  export const it: typeof test
  export function describe(name: string, fn: () => void): void
  export const suite: typeof describe
  export function beforeEach(fn: TestFn): void
  export function afterEach(fn: TestFn): void
  export function beforeAll(fn: TestFn): void
  export function afterAll(fn: TestFn): void
}
