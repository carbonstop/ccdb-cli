import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loginProgress } from '../packages/ccdb-cli/src/output.js';

test('root and command help work without valid configuration or starting services', () => {
  for (const args of [
    ['--help'],
    ['auth', 'login', '--help'],
    ['factor', 'search', '-h'],
    ['factor', 'detail', '--help'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [resolve('packages/ccdb-cli/dist/main.mjs'), ...args],
      {
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          CCDB_PROFILE: 'unregistered-help-fixture',
          CCDB_API_BASE: 'invalid-url',
          CCDB_MCP_PORT: 'invalid-port',
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /ccdb-cli/);
    assert.ok(result.stdout.split('\n').length > 5);
  }
});

test('device and PKCE progress are readable without rendering arbitrary secret fields', () => {
  const device = loginProgress({
    event: 'authorization_pending',
    verificationUri: 'https://example.com/device',
    userCode: 'ABCD-EFGH',
    expiresIn: 900,
    accessToken: 'secret-fixture',
  });
  assert.match(device, /设备码：ABCD-EFGH/);
  assert.match(device, /有效期：15 分钟/);
  assert.match(device, /https:\/\/example.com\/device/);
  assert.ok(!device.includes('secret-fixture'));
  const pkce = loginProgress({
    event: 'authorization_pending',
    authorizationUri: 'https://example.com/authorize',
  });
  assert.match(pkce, /授权链接：https:\/\/example.com\/authorize/);
  assert.ok(!pkce.includes('设备码'));
  assert.match(loginProgress({ event: 'browser_unavailable' }), /手动访问/);
  assert.match(
    loginProgress({ event: 'credential_storage', message: '已使用加密文件存储' }),
    /加密文件存储/,
  );
  assert.ok(!loginProgress({ event: 'unknown', message: '\u001bunsafe\u0007' }).includes('\u001b'));
});
