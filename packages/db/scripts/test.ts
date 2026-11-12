import { spawnSync } from 'node:child_process';
import { loadEnv } from '@ieventplux/config';
const env = loadEnv();
if (env.APP_ENV !== 'development' || env.NODE_ENV === 'production') {
  throw new Error('Database integration tests are development-only');
}
const databaseName = new URL(env.TEST_DATABASE_URL).pathname.slice(1);
if (
  !databaseName.endsWith('_test') ||
  env.TEST_DATABASE_URL === env.DATABASE_URL
) {
  throw new Error(
    'TEST_DATABASE_URL must target a separate database ending in _test',
  );
}
const childEnv = { ...process.env, DATABASE_URL: env.TEST_DATABASE_URL };
for (const args of [
  ['prisma', 'migrate', 'deploy'],
  ['vitest', 'run'],
]) {
  const result = spawnSync(args[0]!, args.slice(1), {
    stdio: 'inherit',
    env: childEnv,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
