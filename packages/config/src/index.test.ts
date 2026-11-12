import { describe, expect, it } from 'vitest';
import { assertDevelopment, parseEnv } from './index.js';

describe('environment safety', () => {
  it('loads explicit development defaults without provider credentials', () => {
    expect(parseEnv({}).HUBTEL_MODE).toBe('simulator');
    expect(parseEnv({ SMTP_SECURE: 'false' }).SMTP_SECURE).toBe(false);
  });
  it('rejects malformed variables without leaking their values', () => {
    expect(() => parseEnv({ DATABASE_URL: 'invalid-secret' })).toThrow(
      'DATABASE_URL',
    );
    expect(() => parseEnv({ SMTP_PORT: 'NaN' })).toThrow('SMTP_PORT');
  });
  it.each([{ APP_ENV: 'production' }, { NODE_ENV: 'production' }])(
    'rejects simulator under either production gate',
    (input) => {
      expect(() => parseEnv(input)).toThrow('simulator is forbidden');
    },
  );
  it('reports missing production configuration instead of using development defaults', () => {
    expect(() =>
      parseEnv({ APP_ENV: 'production', HUBTEL_MODE: 'live' }),
    ).toThrow('Missing production-critical');
  });
  it('requires development for seeds and resets, including staging', () => {
    expect(() =>
      assertDevelopment(parseEnv({ APP_ENV: 'staging' }), 'seed'),
    ).toThrow('development-only');
    expect(() => assertDevelopment(parseEnv({}), 'seed')).not.toThrow();
    expect(() =>
      assertDevelopment({ ...parseEnv({}), APP_ENV: 'production' }, 'seed'),
    ).toThrow('development-only');
    expect(() =>
      assertDevelopment({ ...parseEnv({}), NODE_ENV: 'production' }, 'reset'),
    ).toThrow('development-only');
  });
});
