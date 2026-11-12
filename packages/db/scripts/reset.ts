import { spawnSync } from 'node:child_process';
import { assertDevelopment, loadEnv } from '@ieventplux/config';
const env = loadEnv();
assertDevelopment(env, 'Database reset');
const result = spawnSync(
  'prisma',
  ['migrate', 'reset', '--force', '--skip-seed'],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
  },
);
process.exit(result.status ?? 1);
