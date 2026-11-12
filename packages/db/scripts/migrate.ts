import { spawnSync } from 'node:child_process';
import { loadEnv } from '@ieventplux/config';
const env = loadEnv();
const result = spawnSync('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
});
process.exit(result.status ?? 1);
