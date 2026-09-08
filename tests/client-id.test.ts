import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appConfig } from '../packages/ccdb-cli/src/config.js';
import { FileCredentialStore } from 'ccdb-client/auth/store';

test('application client IDs map to the effective profile', () => {
  for (const [profile, suffix] of Object.entries({
    local: 'local',
    test: 'test',
    pre: 'pre',
    production: 'prod',
  })) {
    assert.equal(appConfig({}, { profile }).clientId, 'ccdb-cli-' + suffix);
    assert.equal(appConfig({ CCDB_PROFILE: profile }).clientId, 'ccdb-cli-' + suffix);
  }
  assert.equal(appConfig({}).clientId, 'ccdb-cli-prod');
  assert.equal(
    appConfig({ CCDB_PROFILE: 'production' }, { profile: 'test' }).clientId,
    'ccdb-cli-test',
  );
});

test('explicit client ID remains compatible with existing registrations', () => {
  assert.equal(
    appConfig({ CCDB_CLIENT_ID: 'ccdb-connect-local' }, { profile: 'test' }).clientId,
    'ccdb-connect-local',
  );
  assert.equal(appConfig({ CCDB_CLIENT_ID: 'env' }, { clientId: 'override' }).clientId, 'override');
  assert.throws(
    () => appConfig({ CCDB_API_BASE: 'https://custom.example' }, { profile: 'custom' }),
    /CCDB_CLIENT_ID/,
  );
  assert.equal(
    appConfig(
      {
        CCDB_API_BASE: 'https://custom.example',
        CCDB_AGENT_WEB: 'https://agent.example',
        CCDB_CLIENT_ID: 'registered',
      },
      { profile: 'custom' },
    ).clientId,
    'registered',
  );
});

test('changed defaults do not reuse credentials from the legacy application', () => {
  const current = appConfig({}, { profile: 'test' });
  const legacy = appConfig({ CCDB_CLIENT_ID: 'ccdb-connect-local' }, { profile: 'test' });
  assert.notEqual(new FileCredentialStore(current).key, new FileCredentialStore(legacy).key);
});
