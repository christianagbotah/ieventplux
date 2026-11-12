import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const optionalSecret = z.string().optional();
const schema = z.object({
  APP_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .default(
      'postgresql://ieventplux:ieventplux_dev@localhost:5432/ieventplux',
    ),
  TEST_DATABASE_URL: z
    .string()
    .url()
    .default(
      'postgresql://ieventplux:ieventplux_dev@localhost:5432/ieventplux_test',
    ),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  STORAGE_S3_ENDPOINT: z.string().url().optional(),
  STORAGE_S3_REGION: z.string().default('auto'),
  STORAGE_S3_BUCKET: optionalSecret,
  STORAGE_S3_ACCESS_KEY_ID: optionalSecret,
  STORAGE_S3_SECRET_ACCESS_KEY: optionalSecret,
  STORAGE_PUBLIC_URL: z.string().url().optional(),
  API_URL: z.string().url().default('http://localhost:4000'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  MOBILE_URL: z.string().url().default('ieventplux://'),
  HUBTEL_MODE: z.enum(['simulator', 'sandbox', 'live']).default('simulator'),
  HUBTEL_CHECKOUT_BASE_URL: z
    .string()
    .url()
    .default('https://payproxyapi.hubtel.com'),
  HUBTEL_STATUS_BASE_URL: z
    .string()
    .url()
    .default('https://api-txnstatus.hubtel.com'),
  HUBTEL_REFUND_BASE_URL: z
    .string()
    .url()
    .default('https://refund-api.hubtel.com'),
  HUBTEL_SEND_MONEY_BASE_URL: z
    .string()
    .url()
    .default('https://smp.hubtel.com'),
  HUBTEL_PAYOUT_STATUS_BASE_URL: z
    .string()
    .url()
    .default('https://smrsc.hubtel.com'),
  HUBTEL_SMS_BASE_URL: z.string().url().default('https://sms.hubtel.com'),
  HUBTEL_CHECKOUT_API_ID: optionalSecret,
  HUBTEL_CHECKOUT_API_KEY: optionalSecret,
  HUBTEL_STATUS_API_ID: optionalSecret,
  HUBTEL_STATUS_API_KEY: optionalSecret,
  HUBTEL_REFUND_API_ID: optionalSecret,
  HUBTEL_REFUND_API_KEY: optionalSecret,
  HUBTEL_SEND_MONEY_API_ID: optionalSecret,
  HUBTEL_SEND_MONEY_API_KEY: optionalSecret,
  HUBTEL_POS_SALES_ID: optionalSecret,
  HUBTEL_MERCHANT_ACCOUNT_NUMBER: optionalSecret,
  HUBTEL_DISBURSEMENT_ACCOUNT: optionalSecret,
  HUBTEL_SMS_CLIENT_ID: optionalSecret,
  HUBTEL_SMS_CLIENT_SECRET: optionalSecret,
  HUBTEL_SMS_SENDER: z
    .string()
    .max(11)
    .regex(/^[a-zA-Z0-9]*$/)
    .optional(),
  CLOUDFLARE_ACCOUNT_ID: optionalSecret,
  CLOUDFLARE_API_TOKEN: optionalSecret,
  CLOUDFLARE_STREAM_SIGNING_KEY_ID: optionalSecret,
  CLOUDFLARE_STREAM_SIGNING_KEY_JWK: optionalSecret,
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: optionalSecret,
  SMTP_PASSWORD: optionalSecret,
  SMTP_FROM: z.string().email().default('noreply@ieventplux.example'),
  EXPO_ACCESS_TOKEN: optionalSecret,
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: optionalSecret,
  AI_MODEL: optionalSecret,
});

export type Environment = z.infer<typeof schema>;

const productionRequired = [
  'DATABASE_URL',
  'REDIS_URL',
  'STORAGE_S3_ENDPOINT',
  'STORAGE_S3_REGION',
  'STORAGE_S3_BUCKET',
  'STORAGE_S3_ACCESS_KEY_ID',
  'STORAGE_S3_SECRET_ACCESS_KEY',
  'STORAGE_PUBLIC_URL',
  'API_URL',
  'WEB_URL',
  'MOBILE_URL',
  'HUBTEL_MODE',
  'HUBTEL_CHECKOUT_API_ID',
  'HUBTEL_CHECKOUT_API_KEY',
  'HUBTEL_STATUS_API_ID',
  'HUBTEL_STATUS_API_KEY',
  'HUBTEL_REFUND_API_ID',
  'HUBTEL_REFUND_API_KEY',
  'HUBTEL_SEND_MONEY_API_ID',
  'HUBTEL_SEND_MONEY_API_KEY',
  'HUBTEL_POS_SALES_ID',
  'HUBTEL_MERCHANT_ACCOUNT_NUMBER',
  'HUBTEL_DISBURSEMENT_ACCOUNT',
  'HUBTEL_SMS_CLIENT_ID',
  'HUBTEL_SMS_CLIENT_SECRET',
  'HUBTEL_SMS_SENDER',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_STREAM_SIGNING_KEY_ID',
  'CLOUDFLARE_STREAM_SIGNING_KEY_JWK',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
] as const;

export function parseEnv(
  input: Record<string, string | undefined>,
): Environment {
  const normalized = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      value?.trim() === '' ? undefined : value,
    ]),
  );
  const result = schema.safeParse(normalized);
  if (!result.success) {
    throw new Error(
      'Invalid environment: ' +
        result.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; '),
    );
  }
  const env = result.data;
  const production =
    env.APP_ENV === 'production' || env.NODE_ENV === 'production';
  if (production && env.HUBTEL_MODE === 'simulator') {
    throw new Error(
      'Invalid environment: HUBTEL_MODE=simulator is forbidden in production',
    );
  }
  if (production) {
    const missing = productionRequired.filter((key) => !normalized[key]);
    if (missing.length)
      throw new Error(
        'Missing production-critical environment variables: ' +
          missing.join(', '),
      );
    for (const key of [
      'API_URL',
      'WEB_URL',
      'STORAGE_PUBLIC_URL',
      'STORAGE_S3_ENDPOINT',
    ] as const) {
      if (!env[key]?.startsWith('https://'))
        throw new Error(
          'Invalid production environment: ' + key + ' must use HTTPS',
        );
    }
  }
  return env;
}

export function loadEnv(): Environment {
  dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
  return parseEnv(process.env);
}

export function assertDevelopment(env: Environment, operation: string): void {
  if (env.APP_ENV !== 'development' || env.NODE_ENV === 'production') {
    throw new Error(
      operation + ' is development-only; refusing outside development',
    );
  }
}
