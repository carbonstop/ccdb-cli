import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { OAuthClient, FileCredentialStore, CcdbClient, verifyCallback } from 'ccdb-client';
import { fixture, MemoryStore } from './helpers.js';
test('parallel refresh is serialized; fresh token reused across callers', async () => {
  const f = await fixture();
  try {
    const store = new MemoryStore();
    store.value = {
      kind: 'oauth',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: 1,
    };
    const a = new OAuthClient(f.settings, store),
      b = new OAuthClient(f.settings, store);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).credential()),
    );
    assert.equal(f.calls.filter((c) => c.body.grant_type === 'refresh_token').length, 1);
    assert.ok(results.every((r) => r.headers.Authorization === 'Bearer coa_test_1'));
    assert.equal(store.value.refreshToken, 'cor_test_1');
    assert.equal(store.value.refreshInProgress, undefined);
  } finally {
    await f.close();
  }
});
test('ambiguous refresh failure leaves durable marker and never replays old refresh', async () => {
  const f = await fixture((c, r) => {
    if (c.path.endsWith('/token')) {
      r.destroy();
      return true;
    }
    return false;
  });
  try {
    const store = new MemoryStore();
    store.value = {
      kind: 'oauth',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
      refreshToken: 'old-refresh',
      expiresAt: 1,
    };
    const a = new OAuthClient(f.settings, store);
    await assert.rejects(a.credential());
    assert.equal(store.value.refreshInProgress, true);
    await assert.rejects(new OAuthClient(f.settings, store).credential(), {
      code: 'login_required',
    });
    assert.equal(f.calls.filter((c) => c.path.endsWith('/token')).length, 1);
    assert.equal((await a.status()).authenticated, false);
  } finally {
    await f.close();
  }
});
test('cannot write journal => refresh request is not sent', async () => {
  const f = await fixture();
  try {
    const store = new MemoryStore();
    store.value = {
      kind: 'oauth',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
      refreshToken: 'old',
      expiresAt: 1,
    };
    store.write = async () => {
      throw Error('disk failed');
    };
    await assert.rejects(new OAuthClient(f.settings, store).credential());
    assert.equal(f.calls.filter((c) => c.path.endsWith('/token')).length, 0);
  } finally {
    await f.close();
  }
});

test('failed final token write keeps the refresh marker and prevents a second exchange', async () => {
  const f = await fixture();
  try {
    const store = new MemoryStore();
    store.value = {
      kind: 'oauth',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: 1,
    };
    const save = store.write.bind(store);
    store.write = async (value) => {
      if (!value.refreshInProgress) throw new Error('final write failed');
      await save(value);
    };
    await assert.rejects(new OAuthClient(f.settings, store).credential(), /final write failed/);
    assert.equal(store.value.refreshInProgress, true);
    assert.equal(store.value.refreshToken, 'old-refresh');
    await assert.rejects(new OAuthClient(f.settings, store).credential(), {
      code: 'login_required',
    });
    assert.equal(f.calls.filter((call) => call.body.grant_type === 'refresh_token').length, 1);
  } finally {
    await f.close();
  }
});

test('environment Key bypasses saved identity; a newer saved token avoids repeated refresh', async () => {
  const f = await fixture();
  try {
    const store = new MemoryStore();
    store.value = {
      kind: 'oauth',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
      accessToken: 'newer-access',
      refreshToken: 'newer-refresh',
      expiresAt: Date.now() + 3_600_000,
    };
    const oauth = new OAuthClient(f.settings, store);
    assert.equal(
      (await oauth.credential(undefined, 'earlier-failed-access')).accessToken,
      'newer-access',
    );

    store.read = async () => {
      throw new Error('saved identity must not be read');
    };
    const environment = new OAuthClient({ ...f.settings, apiKey: 'explicit-test-key' }, store);
    assert.deepEqual(await environment.credential(), {
      kind: 'api-key',
      headers: { 'X-API-Key': 'explicit-test-key' },
    });
    assert.equal(f.calls.length, 0);
  } finally {
    await f.close();
  }
});
test('OAuth 401 permits one refresh and one business retry only', async () => {
  const f = await fixture((c, r) => {
    if (c.path.endsWith('/search')) {
      r.writeHead(401).end('{"error":"invalid_token"}');
      return true;
    }
    return false;
  });
  try {
    const store = new MemoryStore();
    store.value = {
      kind: 'oauth',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
      accessToken: 'coa_old',
      refreshToken: 'cor_old',
      expiresAt: Date.now() + 3600000,
    };
    await assert.rejects(new CcdbClient(f.settings, store).search({ query: '电力' }));
    assert.equal(f.calls.filter((c) => c.path.endsWith('/search')).length, 2);
    assert.equal(f.calls.filter((c) => c.body.grant_type === 'refresh_token').length, 1);
  } finally {
    await f.close();
  }
});
test('device pending and slow_down obey increasing polling interval', async () => {
  let polls = 0,
    now = Date.now();
  const f = await fixture((c, r) => {
    if (c.path.endsWith('/token') && ++polls <= 2) {
      r.writeHead(400).end(
        JSON.stringify({ error: polls === 1 ? 'authorization_pending' : 'slow_down' }),
      );
      return true;
    }
    return false;
  });
  try {
    const store = new MemoryStore(),
      a = new OAuthClient(f.settings, store, fetch, () => now),
      device = await a.deviceStart();
    const waits: number[] = [];
    await a.pollDevice(device, undefined, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    assert.deepEqual(waits, [1000, 1000, 6000]);
    assert.equal(store.value?.kind, 'oauth');
    assert.equal(
      f.calls.find((c) => c.path.endsWith('/token'))?.body.device_code,
      'secret-device-code',
    );
  } finally {
    await f.close();
  }
});
test('device expired/cancelled never polls or saves credentials', async () => {
  const f = await fixture();
  try {
    const s = new MemoryStore();
    let now = Date.now();
    const a = new OAuthClient(f.settings, s, fetch, () => now);
    const d = await a.deviceStart();
    await assert.rejects(
      a.pollDevice({ ...d, expires_in: 1 }, undefined, async (ms) => {
        now += ms;
      }),
      { code: 'expired_token' },
    );
    await assert.rejects(a.pollDevice(d, AbortSignal.abort(), async () => {}));
    assert.equal(s.value, undefined);
    assert.equal(f.calls.filter((c) => c.path.endsWith('/token')).length, 0);
  } finally {
    await f.close();
  }
});
test('PKCE S256/state/issuer and fixed callback query validated', async () => {
  const f = await fixture();
  try {
    const a = new OAuthClient(
      { ...f.settings, redirectUri: 'http://127.0.0.1:3210/callback?fixed=1' },
      new MemoryStore(),
    );
    const p = await a.createAuthorization();
    assert.equal(
      new URL(p.url).searchParams.get('code_challenge'),
      createHash('sha256').update(p.verifier).digest('base64url'),
    );
    assert.equal(p.verifier.length, 43);
    const good = new URL(p.redirectUri);
    good.searchParams.set('code', 'authorization-code');
    good.searchParams.set('state', p.state);
    assert.equal(verifyCallback(good, p), 'authorization-code');
    for (const field of ['state', 'fixed', 'iss']) {
      const bad = new URL(good);
      bad.searchParams.set(field, 'wrong');
      assert.throws(() => verifyCallback(bad, p));
    }
    const dup = new URL(good);
    dup.searchParams.append('code', 'another');
    assert.throws(() => verifyCallback(dup, p));
    assert.throws(() => verifyCallback(good, { ...p, requiresIssuer: true }));
    assert.throws(() => verifyCallback(good, p, p.createdAt + 600001));
    await a.exchangeCallback(good, p);
    const call = f.calls.find((c) => c.path.endsWith('/token'));
    assert.equal(call?.body.code_verifier, p.verifier);
    assert.equal(call?.body.redirect_uri, p.redirectUri);
  } finally {
    await f.close();
  }
});
test('file store isolates profiles, locks concurrent instances and survives replacement', async () => {
  const f = await fixture();
  const directory = await mkdtemp(join(tmpdir(), 'ccdb-store-test-'));
  try {
    const a = new FileCredentialStore({ ...f.settings, configDir: directory }),
      b = new FileCredentialStore({ ...f.settings, configDir: directory });
    let inside = 0,
      max = 0;
    await Promise.all(
      [a, b, a, b].map((s) =>
        s.locked(async () => {
          inside++;
          max = Math.max(max, inside);
          await new Promise((r) => setTimeout(r, 20));
          inside--;
        }),
      ),
    );
    assert.equal(max, 1);
    await a.write({
      kind: 'api-key',
      apiKey: 'test-only-key',
      issuer: f.settings.issuer,
      clientId: f.settings.clientId,
      resource: f.settings.resource,
    });
    assert.equal((await b.read())?.apiKey, 'test-only-key');
    assert.equal(
      await new FileCredentialStore({
        ...f.settings,
        profile: 'other',
        configDir: directory,
      }).read(),
      undefined,
    );
    await b.clear();
    assert.equal(await a.read(), undefined);
  } finally {
    await f.close();
  }
});
test(
  'Windows DPAPI protects stored key at rest',
  { skip: process.platform !== 'win32' },
  async () => {
    const f = await fixture();
    const directory = await mkdtemp(join(tmpdir(), 'ccdb-dpapi-test-'));
    try {
      const store = new FileCredentialStore({ ...f.settings, store: 'auto', configDir: directory });
      await store.write({
        kind: 'api-key',
        apiKey: 'sensitive-test-only-key',
        issuer: f.settings.issuer,
        clientId: f.settings.clientId,
        resource: f.settings.resource,
      });
      const raw = await readFile(store.file, 'utf8');
      assert.ok(!raw.includes('sensitive-test-only-key'));
      assert.equal(JSON.parse(raw).format, 'dpapi');
      assert.equal((await store.read())?.apiKey, 'sensitive-test-only-key');
      await store.clear();
    } finally {
      await f.close();
    }
  },
);
