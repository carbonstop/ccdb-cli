import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, factorId, detailResult } from './helpers.js';
const native = process.env.CCDB_TEST_BINARY;
const artifact = native || resolve('packages/ccdb-cli/dist/main.mjs');
function run(file: string, args: string[], env: NodeJS.ProcessEnv, input?: string) {
  return new Promise<{ code: number | null; out: string; err: string }>((yes, no) => {
    const p = spawn(native ? file : process.execPath, native ? args : [file, ...args], {
      env: native ? { ...env, PATH: '' } : env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '',
      err = '';
    p.stdin.end(input);
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('error', no);
    p.on('exit', (code) => yes({ code, out, err }));
  });
}
test('standalone CLI bundle runs without node_modules and maps full CLI arguments', async () => {
  const f = await fixture();
  const dir = await mkdtemp(join(tmpdir(), 'ccdb-cli-isolated-'));
  const script = join(dir, native ? 'ccdb-cli.exe' : 'ccdb.mjs');
  await copyFile(artifact, script);
  try {
    const env = {
      ...process.env,
      CCDB_PROFILE: 'local',
      CCDB_API_BASE: f.base,
      CCDB_AGENT_WEB: f.base,
      CCDB_API_KEY: 'test-key',
    };
    const result = await run(
      script,
      [
        'factor',
        'search',
        '电力',
        '--country',
        '中国',
        '--country',
        '美国',
        '--year',
        '2024',
        '--year',
        '2025',
        '--source-level',
        '国家排放因子',
        '--accounting-type',
        'enterprise',
        '--limit',
        '4',
        '--json',
      ],
      env,
    );
    assert.equal(result.code, 0, result.err);
    assert.equal(JSON.parse(result.out).items[0].factorId, factorId);
    assert.deepEqual(f.calls[0].body.filters, {
      country: ['中国', '美国'],
      year: [2024, 2025],
      sourceLevel: ['国家排放因子'],
    });
    const detail = await run(script, ['factor', 'detail', factorId, '--json'], env);
    assert.equal(detail.code, 0);
    assert.deepEqual(JSON.parse(detail.out), detailResult(f.base));
    const invalid = await run(
      script,
      ['factor', 'search', '电力', '--company-id', '5', '--json'],
      env,
    );
    assert.equal(invalid.code, 2);
    assert.equal(JSON.parse(invalid.out).error.code, 'INVALID_ARGUMENT');
    assert.equal(f.calls.length, 2);
  } finally {
    await f.close();
  }
});
test('CLI saves an API Key through stdin, uses the file store and logs out', async () => {
  const f = await fixture();
  const directory = await mkdtemp(join(tmpdir(), 'ccdb-cli-auth-'));
  const secret = 'fixture-native-api-key';
  const env = {
    ...process.env,
    CCDB_PROFILE: 'local',
    CCDB_API_BASE: f.base,
    CCDB_AGENT_WEB: f.base,
    CCDB_CONFIG_DIR: directory,
    CCDB_AUTH_STORE: 'file',
    CCDB_API_KEY: '',
  };
  try {
    const login = await run(
      artifact,
      ['auth', 'login', '--method', 'api-key', '--json'],
      env,
      secret + '\n',
    );
    assert.equal(login.code, 0, login.err);
    assert.ok(!(login.out + login.err).includes(secret));
    const query = await run(artifact, ['factor', 'search', '电力', '--json'], env);
    assert.equal(query.code, 0, query.err);
    assert.equal(JSON.parse(query.out).items[0].factorId, factorId);
    const logout = await run(artifact, ['auth', 'logout', '--json'], env);
    assert.equal(logout.code, 0, logout.err);
    const after = await run(artifact, ['factor', 'search', '电力', '--json'], env);
    assert.equal(after.code, 3, after.out + after.err);
  } finally {
    await f.close();
  }
});
test('CLI doctor performs discovery only; status never prints environment Key', async () => {
  const f = await fixture();
  try {
    const env = {
      ...process.env,
      CCDB_PROFILE: 'local',
      CCDB_API_BASE: f.base,
      CCDB_AGENT_WEB: f.base,
      CCDB_API_KEY: 'sk-cs-fixture-private',
    };
    const script = artifact;
    const result = await run(script, ['doctor', '--json'], env);
    assert.equal(result.code, 0, result.err);
    assert.equal(JSON.parse(result.out).factorQuotaConsumed, false);
    assert.equal(f.calls.length, 2);
    assert.ok(!result.out.includes(env.CCDB_API_KEY));
    const status = await run(script, ['auth', 'status', '--json'], env);
    assert.equal(status.code, 0);
    assert.equal(JSON.parse(status.out).verifiedRemotely, false);
    assert.ok(!status.out.includes(env.CCDB_API_KEY));
  } finally {
    await f.close();
  }
});
