import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  config,
  type Credentials,
  type CredentialStore,
} from '../packages/ccdb-client/src/index.js';
export class MemoryStore implements CredentialStore {
  value?: Credentials;
  writes = 0;
  private queue: Promise<unknown> = Promise.resolve();
  async read() {
    return this.value && structuredClone(this.value);
  }
  async write(value: Credentials) {
    this.writes++;
    this.value = structuredClone(value);
  }
  async clear() {
    this.value = undefined;
  }
  async locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }
}
export const factorId = '9223372036854775806';
export function searchResult(base: string) {
  return {
    requestId: 'test-search',
    items: [
      {
        factorId,
        name: { zh: '电力', en: 'Electricity' },
        value: '******',
        numeratorUnit: 'kgCO₂e',
        denominatorUnit: 'kWh',
        specification: '2024适用年',
        year: '2025',
        country: '中国',
        sourceName: 'fixture',
        verified: false,
        detailUrl: `${base}/factors/${factorId}`,
        extra: 'preserved',
      },
    ],
    limit: 5,
  };
}
export function detailResult(base: string) {
  return {
    code: 200,
    msg: '成功',
    data: {
      factorId,
      id: factorId,
      name: '电力',
      cValue: '******',
      gasData: [{ factorValue: '******', type: 'g9' }],
      extraNested: { test: true },
      detailUrl: `${base}/factors/${factorId}`,
    },
    requestId: 'test-detail',
  };
}
export interface Call {
  path: string;
  method?: string;
  headers: IncomingMessage['headers'];
  body: any;
}
export async function fixture(
  override?: (call: Call, res: ServerResponse) => boolean | Promise<boolean>,
) {
  const calls: Call[] = [];
  let base = '';
  let refreshes = 0;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body: any = {};
    try {
      body = req.headers['content-type']?.includes('application/json')
        ? JSON.parse(raw || '{}')
        : Object.fromEntries(new URLSearchParams(raw));
    } catch {}
    const call = { path: req.url || '/', method: req.method, headers: { ...req.headers }, body };
    calls.push(call);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Request-Id', 'fixture-request');
    try {
      if (await override?.(call, res)) return;
      if (call.path === '/.well-known/oauth-authorization-server/auth')
        return res.end(
          JSON.stringify({
            issuer: base + '/auth',
            authorization_endpoint: base + '/oauth/authorize',
            token_endpoint: base + '/auth/oauth/token',
            device_authorization_endpoint: base + '/auth/oauth/device_authorization',
            revocation_endpoint: base + '/auth/oauth/revoke',
            code_challenge_methods_supported: ['S256'],
          }),
        );
      if (call.path === '/.well-known/oauth-protected-resource/management/api/ccdb/v1')
        return res.end(
          JSON.stringify({
            resource: base + '/management/api/ccdb/v1',
            authorization_servers: [base + '/auth'],
          }),
        );
      if (call.path === '/auth/oauth/device_authorization')
        return res.end(
          JSON.stringify({
            device_code: 'secret-device-code',
            user_code: 'ABCD-1234',
            verification_uri: base + '/oauth/device',
            verification_uri_complete: base + '/oauth/device?user_code=ABCD-1234',
            expires_in: 30,
            interval: 1,
          }),
        );
      if (call.path === '/auth/oauth/token') {
        if (body.grant_type === 'refresh_token') refreshes++;
        return res.end(
          JSON.stringify({
            access_token: 'coa_test_' + refreshes,
            refresh_token: 'cor_test_' + refreshes,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'ccdb.factor.search ccdb.factor.read offline_access',
          }),
        );
      }
      if (call.path === '/auth/oauth/revoke') return res.end('{}');
      if (call.path === '/management/api/ccdb/v1/factors/search')
        return res.end(JSON.stringify(searchResult(base)));
      if (call.path.startsWith('/management/api/ccdb/v1/factors/'))
        return res.end(JSON.stringify(detailResult(base)));
      res.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    } catch {
      res.writeHead(500).end(JSON.stringify({ error: 'fixture_failed' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address');
  base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    calls,
    settings: config(
      {},
      {
        profile: 'local',
        apiBase: base,
        issuer: base + '/auth',
        resource: base + '/management/api/ccdb/v1',
        webBase: base,
        store: 'file',
      },
    ),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
