import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return new Promise<{ code: number | null; out: string; err: string }>((yes, no) => {
    const p = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('error', no);
    p.on('exit', (code) => yes({ code, out, err }));
  });
}
test('shared client is pinned to npm without a vendored workspace', async () => {
  const root = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const client = lock.packages['node_modules/ccdb-client'];
  assert.match(root.dependencies['ccdb-client'], /^\d+\.\d+\.\d+$/);
  assert.equal(client.version, root.dependencies['ccdb-client']);
  assert.match(client.resolved, /^https:\/\/registry\.npmjs\.org\/ccdb-client\/-\//);
  assert.ok(client.integrity);
  assert.equal(client.link, undefined);
  assert.equal(lock.packages['packages/ccdb-client'], undefined);
  await assert.rejects(access('packages/ccdb-client/package.json'), { code: 'ENOENT' });
});

test('npm tgz packages install offline into fresh directories without shared workspace', async () => {
  assert.ok(process.env.npm_execpath, 'Run using npm test');
  for (const name of ['cli']) {
    const directory = await mkdtemp(join(tmpdir(), `ccdb-pack-${name}-`));
    const archive = resolve(`dist/releases/ccdb-${name}-0.1.1.tgz`);
    const install = await run(
      process.execPath,
      [
        process.env.npm_execpath!,
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        archive,
      ],
      directory,
    );
    assert.equal(install.code, 0, install.err);
    await assert.rejects(access(join(directory, 'node_modules/ccdb-client')), { code: 'ENOENT' });
    const notices = await readFile(
      join(directory, 'node_modules/ccdb-cli/dist/THIRD_PARTY_NOTICES.txt'),
      'utf8',
    );
    assert.match(notices, /=== node_modules\/ccdb-client \d+\.\d+\.\d+ ===\s+MIT License/);
    const metadata = JSON.parse(
      await readFile(join(directory, 'node_modules/ccdb-cli/package.json'), 'utf8'),
    );
    assert.deepEqual(metadata.bin, { 'ccdb-cli': 'dist/main.mjs' });
    const installed = join(directory, `node_modules/ccdb-${name}/dist/main.mjs`);
    const result = await run(process.execPath, [installed, '--version'], directory);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out.trim(), `ccdb-cli ${metadata.version}`);
  }
});
