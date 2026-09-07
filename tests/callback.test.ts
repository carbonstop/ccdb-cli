import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { listenForCallback } from '../packages/ccdb-client/src/auth/interactive.js';
import { CcdbError, exitCode } from '../packages/ccdb-client/src/errors.js';
import type { PendingAuthorization } from '../packages/ccdb-client/src/auth/oauth.js';

async function pending(): Promise<PendingAuthorization> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    verifier: 'test-verifier',
    state: 'test-state',
    issuer: 'https://auth.example.test',
    redirectUri: `http://127.0.0.1:${port}/callback`,
    createdAt: Date.now(),
    url: '',
    requiresIssuer: false,
  };
}

test('PKCE callback sends complete safe HTML before listener shutdown', async () => {
  const request = await pending();
  const listener = await listenForCallback(request);
  try {
    const responsePromise = fetch(
      `${request.redirectUri}?state=${request.state}&code=test-authorization-code`,
    );
    const callback = await listener.result;
    await listener.close();
    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text();
    assert.match(html, /已收到授权回调/);
    assert.match(html, /<\/html>$/);
    assert.doesNotMatch(html, /test-authorization-code|test-state/);
    assert.equal(callback.searchParams.get('code'), 'test-authorization-code');
  } finally {
    await listener.close();
  }
});

test('cancelled callback renders cancellation and rejects with access_denied', async () => {
  const request = await pending();
  const listener = await listenForCallback(request);
  try {
    const rejection = assert.rejects(listener.result, { code: 'access_denied' });
    const response = await fetch(
      `${request.redirectUri}?state=${request.state}&error=access_denied`,
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /已取消授权/);
    await rejection;
  } finally {
    await listener.close();
  }
});

test('invalid callback does not settle login or expose untrusted text', async () => {
  const request = await pending();
  const controller = new AbortController();
  const listener = await listenForCallback(request, controller.signal);
  try {
    const response = await fetch(`${request.redirectUri}?state=wrong&code=secret`);
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /secret|wrong/);
    const rejection = assert.rejects(listener.result);
    controller.abort();
    await rejection;
  } finally {
    await listener.close();
  }
});

test('expired refresh credential uses login exit code instead of argument exit code', () => {
  assert.equal(exitCode(new CcdbError('invalid_grant', 'expired', 400)), 3);
  assert.equal(exitCode(new CcdbError('INVALID_ARGUMENT', 'invalid', 400)), 2);
});
