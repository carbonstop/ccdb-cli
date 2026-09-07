import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CcdbClient,
  CcdbError,
  factorIdSchema,
  searchSchema,
  config,
  retryAfter,
} from '../packages/ccdb-client/src/index.js';
import { fixture, MemoryStore, factorId, detailResult, searchResult } from './helpers.js';
import { jsonRequest } from '../packages/ccdb-client/src/http.js';

test('HTTP error mapping redacts echoed headers and form credentials while preserving diagnostics', async () => {
  const secrets = [
    'header-key',
    'internal-context',
    'bearer-value',
    'refresh-value',
    'device-value',
    'code-value',
    'verifier-value',
    'token-value',
  ];
  const f = await fixture((_call, response) => {
    response.writeHead(429, { 'Retry-After': '17' }).end(
      JSON.stringify({
        error: 'rate_limit_exceeded',
        error_description: secrets.join(' '),
        requestId: 'redaction-request',
      }),
    );
    return true;
  });
  try {
    await assert.rejects(
      jsonRequest(
        fetch,
        f.base + '/token',
        {
          method: 'POST',
          headers: {
            'X-API-Key': secrets[0],
            'X-CCDB-Execution-Context': secrets[1],
            Authorization: `Bearer ${secrets[2]}`,
          },
          body: new URLSearchParams({
            refresh_token: secrets[3],
            device_code: secrets[4],
            code: secrets[5],
            code_verifier: secrets[6],
            token: secrets[7],
          }),
        },
        5000,
      ),
      (error: unknown) => {
        assert.ok(error instanceof CcdbError);
        assert.equal(error.code, 'rate_limit_exceeded');
        assert.equal(error.httpStatus, 429);
        assert.equal(error.retryAfterSeconds, 17);
        assert.equal(error.requestId, 'redaction-request');
        assert.equal(error.message, Array(secrets.length).fill('[REDACTED]').join(' '));
        return true;
      },
    );
    assert.equal(f.calls.length, 1);
  } finally {
    await f.close();
  }
});
test('search maps all input fields; preserves masked values, links and unknown fields', async () => {
  const f = await fixture();
  try {
    const c = new CcdbClient({ ...f.settings, apiKey: 'sk-cs-test-key' }, new MemoryStore());
    const result = await c.search({
      query: '  电力\n生产 ',
      language: 'en',
      accountingType: 'enterprise',
      filters: { country: ['中国'], year: [2025], sourceLevel: ['国家排放因子'] },
      limit: 3,
    });
    assert.deepEqual(result, searchResult(f.base));
    assert.equal(f.calls[0].headers['x-api-key'], 'sk-cs-test-key');
    assert.equal(f.calls[0].headers.authorization, undefined);
    assert.deepEqual(f.calls[0].body, {
      query: '电力 生产',
      language: 'en',
      accountingType: 'enterprise',
      filters: { country: ['中国'], year: [2025], sourceLevel: ['国家排放因子'] },
      limit: 3,
    });
  } finally {
    await f.close();
  }
});
test('detail keeps wrapper, Long string ID, gasData and extension fields', async () => {
  const f = await fixture();
  try {
    const c = new CcdbClient({ ...f.settings, apiKey: 'legacy-user-key' }, new MemoryStore());
    assert.deepEqual(await c.detail(factorId, 'en'), detailResult(f.base));
    assert.match(f.calls[0].path, /language=en$/);
  } finally {
    await f.close();
  }
});
test('rejects imprecise ID and unsafe enumeration before network', () => {
  assert.equal(factorIdSchema.parse(factorId), factorId);
  for (const bad of [Number(factorId), '9223372036854775808', 'abc', '1.2'])
    assert.equal(factorIdSchema.safeParse(bad).success, false);
  for (const bad of [
    { query: '*' },
    { query: 'all' },
    { query: '电力', limit: 11 },
    { query: '电力', companyId: 123 },
    { query: '电力', filters: { country: Array(21).fill('中国') } },
  ])
    assert.equal(searchSchema.safeParse(bad).success, false);
  assert.equal(searchSchema.parse({ query: '风力' }).limit, 5);
});
test('403/429 do not retry or switch from environment Key to saved OAuth', async () => {
  for (const status of [403, 429]) {
    const f = await fixture((c, r) => {
      r.setHeader('Retry-After', '12');
      r.writeHead(status).end(
        JSON.stringify({ code: status, msg: 'scope/limit', requestId: 'req-limit' }),
      );
      return true;
    });
    try {
      const store = new MemoryStore();
      store.value = {
        kind: 'oauth',
        issuer: f.settings.issuer,
        clientId: f.settings.clientId,
        resource: f.settings.resource,
        accessToken: 'coa_other-user',
        refreshToken: 'cor_other-user',
        expiresAt: Date.now() + 100000,
      };
      const c = new CcdbClient({ ...f.settings, apiKey: 'sk-cs-test-key' }, store);
      await assert.rejects(
        c.search({ query: '电力' }),
        (e: unknown) =>
          e instanceof CcdbError &&
          e.httpStatus === status &&
          e.requestId === 'req-limit' &&
          e.retryAfterSeconds === 12,
      );
      assert.equal(f.calls.length, 1);
    } finally {
      await f.close();
    }
  }
});
test('invalid JSON and changed detail ID fail visibly; never empty success', async () => {
  for (const invalid of [
    '<html>login</html>',
    JSON.stringify({
      code: 200,
      msg: 'ok',
      data: { factorId: '123', detailUrl: 'https://example.test' },
      requestId: 'r',
    }),
  ]) {
    const f = await fixture((c, r) => {
      r.end(invalid);
      return true;
    });
    try {
      await assert.rejects(
        new CcdbClient({ ...f.settings, apiKey: 'key' }, new MemoryStore()).detail(factorId),
        { code: 'INVALID_RESPONSE' },
      );
    } finally {
      await f.close();
    }
  }
});
test('redirect never forwards credentials to another endpoint', async () => {
  const f = await fixture((c, r) => {
    r.writeHead(302, { Location: '/stolen' }).end();
    return true;
  });
  try {
    await assert.rejects(
      new CcdbClient({ ...f.settings, apiKey: 'key' }, new MemoryStore()).search({ query: '电力' }),
    );
    assert.equal(f.calls.length, 1);
  } finally {
    await f.close();
  }
});
test('config profiles and retry-after parsing', () => {
  assert.equal(config({}).apiBase, 'https://gateway.carbonstop.com');
  assert.equal(config({ CCDB_PROFILE: 'local' }).webBase, 'http://127.0.0.1:3100');
  assert.throws(() => config({ CCDB_API_BASE: 'http://untrusted.test' }));
  assert.throws(() => config({ CCDB_API_KEY: 'sk-cs-****' }));
  assert.equal(retryAfter('5'), 5);
  assert.equal(retryAfter('Tue, 01 Jan 2030 00:00:10 GMT', Date.parse('2030-01-01T00:00:00Z')), 10);
});
