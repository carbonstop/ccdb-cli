import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binary = resolve(
  root,
  'dist/native',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ccdb-cli.exe' : 'ccdb-cli',
);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/cli.test.ts'], {
  cwd: root,
  env: { ...process.env, CCDB_TEST_BINARY: binary },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
