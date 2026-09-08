import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'ccdb-client/config';
import { FileCredentialStore } from 'ccdb-client/auth/store';

test('SDK supplies test preset without extra environment variables', () => {
  const c = config({}, { profile: 'test' });
  assert.equal(c.apiBase, 'https://gateway-base-test.carbonstop.com');
  assert.equal(c.webBase, 'https://agenttest.carbonstop.com');
});

test('SDK remembers encrypted file choice without repeated environment configuration', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'ccdb-consumer-storage-'));
  const c = config({}, { profile: 'test', configDir, store: 'file' });
  const writer = new FileCredentialStore(c);
  const value = {
    kind: 'api-key' as const,
    apiKey: 'fixture-only',
    issuer: c.issuer,
    clientId: c.clientId,
    resource: c.resource,
  };
  await writer.locked(() => writer.write(value));
  assert.equal(JSON.parse(await readFile(writer.file, 'utf8')).format, 'encrypted-file-v1');
  const reader = new FileCredentialStore({ ...c, store: 'auto' });
  assert.deepEqual(await reader.read(), value);
  await reader.locked(() => reader.write(value));
  assert.equal(JSON.parse(await readFile(reader.file, 'utf8')).format, 'encrypted-file-v1');
});
