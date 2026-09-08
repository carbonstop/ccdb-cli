import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('built command automatically stores credentials without a system service or store variable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ccdb-bundle-auto-'));
  const bundle = resolve('packages/ccdb-cli/dist/main.mjs');
  const env = {
    PATH: root,
    XDG_CONFIG_HOME: root,
    CCDB_PROFILE: 'test',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  const result = await new Promise<{ code: number | null; output: string }>((yes, no) => {
    const child = spawn(
      process.execPath,
      [bundle, ...['auth', 'login'], '--method', 'api-key', '--json'],
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (x) => {
      output += x;
    });
    child.stderr.on('data', (x) => {
      output += x;
    });
    child.on('error', no);
    child.on('exit', (code) => yes({ code, output }));
    child.stdin.end('synthetic-only-key\n');
  });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /credential_storage/);
  assert.ok(!result.output.includes('synthetic-only-key'));
  const directory = join(root, 'carbonstop', 'ccdb');
  const entries = await readdir(directory);
  assert.equal(entries.filter((f) => f.endsWith('.master-key')).length, 1);
  const files = entries.filter((f) => f.endsWith('.json'));
  assert.equal(files.length, 1);
  const raw = await readFile(join(directory, files[0]), 'utf8');
  assert.equal(JSON.parse(raw).format, 'encrypted-file-v1');
  assert.ok(!raw.includes('synthetic-only-key'));
});
