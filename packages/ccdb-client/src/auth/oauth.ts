import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { validUrl, type Config } from '../config.js';
import { CcdbError } from '../errors.js';
import { jsonRequest } from '../http.js';
import type { Credentials, CredentialStore } from './store.js';

const REFRESH_WINDOW_MS = 60_000;
const AUTHORIZATION_TIMEOUT_MS = 600_000;

interface RequestCredential {
  headers: Record<string, string>;
  kind: 'oauth' | 'api-key';
  accessToken?: string;
}

const metadataSchema = z
  .object({
    issuer: z.string(),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    device_authorization_endpoint: z.string(),
    revocation_endpoint: z.string(),
    code_challenge_methods_supported: z.array(z.string()),
    authorization_response_iss_parameter_supported: z.boolean().optional(),
  })
  .passthrough();
const deviceSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string(),
  verification_uri_complete: z.string().optional(),
  expires_in: z.number().positive(),
  interval: z.number().positive().default(5),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().refine((v) => v.toLowerCase() === 'bearer'),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});
export type DeviceAuthorization = z.infer<typeof deviceSchema>;
export interface PendingAuthorization {
  verifier: string;
  state: string;
  issuer: string;
  redirectUri: string;
  createdAt: number;
  url: string;
  requiresIssuer: boolean;
}
export class OAuthClient {
  private metadata?: Promise<z.infer<typeof metadataSchema>>;
  constructor(
    readonly config: Config,
    readonly store: CredentialStore,
    readonly fetcher: typeof fetch = fetch,
    readonly now = Date.now,
  ) {}
  async discover(signal?: AbortSignal) {
    if (!this.metadata)
      this.metadata = this.loadMetadata(signal).catch((e) => {
        this.metadata = undefined;
        throw e;
      });
    return this.metadata;
  }
  private async loadMetadata(signal?: AbortSignal) {
    const issuer = validUrl(this.config.issuer);
    const url = `${issuer.origin}/.well-known/oauth-authorization-server${
      issuer.pathname === '/' ? '' : issuer.pathname
    }`;
    const metadata = metadataSchema.parse(
      await jsonRequest(this.fetcher, url, { signal }, this.config.timeoutMs),
    );
    if (metadata.issuer !== this.config.issuer)
      throw new CcdbError('INVALID_METADATA', '发现结果 issuer 与当前环境不一致');
    for (const endpoint of [
      'token_endpoint',
      'device_authorization_endpoint',
      'revocation_endpoint',
    ] as const)
      if (validUrl(metadata[endpoint]).origin !== issuer.origin)
        throw new CcdbError('INVALID_METADATA', 'OAuth 端点不属于配置的授权服务器');
    if (validUrl(metadata.authorization_endpoint).origin !== validUrl(this.config.webBase).origin)
      throw new CcdbError('INVALID_METADATA', '授权页面地址与当前 Agent 环境不一致');
    const resource = validUrl(this.config.resource);
    const protectedUrl = `${resource.origin}/.well-known/oauth-protected-resource${
      resource.pathname === '/' ? '' : resource.pathname
    }`;
    const info: any = await jsonRequest(
      this.fetcher,
      protectedUrl,
      { signal },
      this.config.timeoutMs,
    );
    if (
      info.resource !== this.config.resource ||
      !Array.isArray(info.authorization_servers) ||
      !info.authorization_servers.includes(metadata.issuer)
    )
      throw new CcdbError('INVALID_METADATA', '资源发现结果与当前配置不一致');
    return metadata;
  }
  private async form(url: string, fields: Record<string, string>, signal?: AbortSignal) {
    return jsonRequest(
      this.fetcher,
      url,
      {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(fields),
      },
      this.config.timeoutMs,
    );
  }
  async deviceStart(signal?: AbortSignal): Promise<DeviceAuthorization> {
    const meta = await this.discover(signal);
    const device = deviceSchema.parse(
      await this.form(
        meta.device_authorization_endpoint,
        {
          client_id: this.config.clientId,
          scope: this.config.scope,
          resource: this.config.resource,
        },
        signal,
      ),
    );
    for (const url of [device.verification_uri, device.verification_uri_complete].filter(
      Boolean,
    ) as string[])
      if (validUrl(url).origin !== validUrl(this.config.webBase).origin)
        throw new CcdbError('INVALID_METADATA', '设备授权地址与 Agent 环境不一致');
    return device;
  }
  async pollDevice(
    device: DeviceAuthorization,
    signal?: AbortSignal,
    sleep = (ms: number) => delay(ms, undefined, { signal }),
  ) {
    const meta = await this.discover(signal);
    const deadline = this.now() + device.expires_in * 1000;
    let interval = Math.max(1, device.interval);
    while (this.now() < deadline) {
      signal?.throwIfAborted();
      await sleep(Math.min(interval * 1000, Math.max(0, deadline - this.now())));
      if (this.now() >= deadline) break;
      try {
        const token = await this.form(
          meta.token_endpoint,
          {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            client_id: this.config.clientId,
            device_code: device.device_code,
            resource: this.config.resource,
          },
          signal,
        );
        return await this.store.locked(() => this.saveToken(token));
      } catch (e) {
        if (e instanceof CcdbError && e.code === 'slow_down') interval += 5;
        else if (!(e instanceof CcdbError && e.code === 'authorization_pending')) throw e;
      }
    }
    throw new CcdbError('expired_token', '设备码已过期，请重新执行登录', 400);
  }
  async createAuthorization(signal?: AbortSignal): Promise<PendingAuthorization> {
    const meta = await this.discover(signal);
    if (!meta.code_challenge_methods_supported.includes('S256'))
      throw new CcdbError('INVALID_METADATA', '授权服务器未声明 PKCE S256');
    const verifier = randomBytes(32).toString('base64url'),
      state = randomBytes(24).toString('base64url');
    const url = new URL(meta.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource: this.config.resource,
    }).toString();
    return {
      verifier,
      state,
      url: url.href,
      issuer: meta.issuer,
      redirectUri: this.config.redirectUri,
      createdAt: this.now(),
      requiresIssuer: !!meta.authorization_response_iss_parameter_supported,
    };
  }
  async exchangeCallback(url: URL, pending: PendingAuthorization, signal?: AbortSignal) {
    const code = verifyCallback(url, pending, this.now());
    const meta = await this.discover(signal);
    const token = await this.form(
      meta.token_endpoint,
      {
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
        resource: this.config.resource,
      },
      signal,
    );
    return this.store.locked(() => this.saveToken(token));
  }
  private async saveToken(raw: unknown): Promise<Credentials> {
    const token = tokenSchema.parse(raw);
    const value: Credentials = {
      kind: 'oauth',
      issuer: this.config.issuer,
      clientId: this.config.clientId,
      resource: this.config.resource,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: this.now() + token.expires_in * 1000,
      scope: token.scope,
    };
    await this.store.write(value);
    return value;
  }
  async saveKey(apiKey: string) {
    if (!apiKey || /\s|\*/.test(apiKey))
      throw new CcdbError('INVALID_ARGUMENT', '请输入完整且不含空白或掩码的 Key', 400);
    await this.store.locked(() =>
      this.store.write({
        kind: 'api-key',
        apiKey,
        issuer: this.config.issuer,
        clientId: this.config.clientId,
        resource: this.config.resource,
      }),
    );
  }
  async credential(signal?: AbortSignal, failedAccessToken?: string): Promise<RequestCredential> {
    // 显式环境 Key 优先；失败时不能静默切换成另一条已保存的身份。
    if (this.config.apiKey) {
      return { kind: 'api-key', headers: { 'X-API-Key': this.config.apiKey } };
    }

    // 必须获得跨进程锁后再读凭证，刷新请求和新 Token 落盘也在同一锁内。
    return this.store.locked(() => this.storedCredential(signal, failedAccessToken));
  }

  /** 仅由 credential() 在持有凭证锁时调用。 */
  private async storedCredential(
    signal?: AbortSignal,
    failedAccessToken?: string,
  ): Promise<RequestCredential> {
    const current = await this.store.read();
    if (!current) {
      throw new CcdbError(
        'login_required',
        '请先执行 CCDB Connect 登录，或在宿主配置 CCDB_API_KEY',
        401,
      );
    }
    if (current.kind === 'api-key' && current.apiKey) {
      return { kind: 'api-key', headers: { 'X-API-Key': current.apiKey } };
    }
    if (current.kind !== 'oauth') {
      throw new CcdbError('login_required', '凭证不完整，请重新登录', 401);
    }
    if (current.refreshInProgress) {
      throw new CcdbError(
        'login_required',
        '上次刷新被中断，无法确认 Token 是否已轮换；请重新登录，不能重复使用旧 Refresh Token',
        401,
      );
    }

    // 另一进程可能已刷新成功；不要再次刷新它刚保存的新 Token。
    if (
      current.accessToken &&
      (current.expiresAt || 0) > this.now() + REFRESH_WINDOW_MS &&
      (!failedAccessToken || current.accessToken !== failedAccessToken)
    ) {
      return this.bearerCredential(current);
    }
    return this.refreshCredential(current, signal);
  }

  /** 调用方保持凭证锁；异常时保留进行中标记，不重放一次性 Refresh Token。 */
  private async refreshCredential(
    current: Credentials,
    signal?: AbortSignal,
  ): Promise<RequestCredential> {
    if (!current.refreshToken) {
      throw new CcdbError('login_required', '访问凭证已过期，请重新登录', 401);
    }
    const meta = await this.discover(signal);
    signal?.throwIfAborted();

    // 先落盘再发请求。崩溃、超时或最终写入失败都不能静默清除此标记。
    await this.store.write({ ...current, refreshInProgress: true });
    const raw = await this.form(
      meta.token_endpoint,
      {
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        refresh_token: current.refreshToken,
        resource: this.config.resource,
      },
      signal,
    );
    const validated = tokenSchema.parse(raw);
    if (!validated.refresh_token) {
      throw new CcdbError('INVALID_RESPONSE', '刷新响应缺少轮换后的 Refresh Token，请重新登录');
    }
    const next = await this.saveToken(validated);
    return this.bearerCredential(next);
  }

  private bearerCredential(value: Credentials): RequestCredential {
    return {
      kind: 'oauth',
      headers: { Authorization: `Bearer ${value.accessToken}` },
      accessToken: value.accessToken,
    };
  }
  async status() {
    if (this.config.apiKey)
      return {
        profile: this.config.profile,
        authenticated: true,
        credentialSource: 'environment',
        kind: 'api-key',
        issuer: this.config.issuer,
        verifiedRemotely: false,
      };
    const current = await this.store.read();
    return {
      profile: this.config.profile,
      authenticated: !!current && !current.refreshInProgress,
      needsLogin: !current || !!current.refreshInProgress,
      kind: current?.kind,
      issuer: this.config.issuer,
      expiresAt: current?.expiresAt,
      needsRefresh:
        current?.kind === 'oauth' && (current.expiresAt || 0) <= this.now() + REFRESH_WINDOW_MS,
      verifiedRemotely: false,
    };
  }
  async logout(revoke = false, signal?: AbortSignal) {
    await this.store.locked(async () => {
      const current = await this.store.read();
      if (revoke && current?.kind === 'oauth') {
        const meta = await this.discover(signal);
        const token = current.refreshToken || current.accessToken;
        if (token)
          await this.form(
            meta.revocation_endpoint,
            {
              client_id: this.config.clientId,
              token,
              token_type_hint: current.refreshToken ? 'refresh_token' : 'access_token',
            },
            signal,
          );
      }
      await this.store.clear();
    });
    return {
      loggedOutLocally: true,
      revocationRequested: revoke,
      environmentKeyStillConfigured: !!this.config.apiKey,
    };
  }
}
export function verifyCallback(url: URL, pending: PendingAuthorization, now = Date.now()): string {
  const expected = new URL(pending.redirectUri);
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.hash ||
    now < pending.createdAt ||
    now - pending.createdAt > AUTHORIZATION_TIMEOUT_MS
  )
    throw new CcdbError('invalid_state', '授权回调地址不匹配或已过期', 400);
  for (const key of new Set(expected.searchParams.keys()))
    if (
      JSON.stringify(url.searchParams.getAll(key)) !==
      JSON.stringify(expected.searchParams.getAll(key))
    )
      throw new CcdbError('invalid_state', '授权回调固定参数不匹配', 400);
  for (const field of ['state', 'code', 'iss', 'error'])
    if (url.searchParams.getAll(field).length > 1)
      throw new CcdbError('invalid_state', '授权回调存在重复参数', 400);
  const state = url.searchParams.get('state') || '';
  if (
    Buffer.byteLength(state) !== Buffer.byteLength(pending.state) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
  )
    throw new CcdbError('invalid_state', '授权回调 state 校验失败', 400);
  const issuer = url.searchParams.get('iss');
  if ((pending.requiresIssuer && !issuer) || (issuer && issuer !== pending.issuer))
    throw new CcdbError('invalid_state', '授权回调 issuer 校验失败', 400);
  if (url.searchParams.has('error'))
    throw new CcdbError(
      url.searchParams.get('error') || 'access_denied',
      '用户取消或授权未完成',
      400,
    );
  const code = url.searchParams.get('code');
  if (!code) throw new CcdbError('INVALID_ARGUMENT', '授权回调缺少 code', 400);
  return code;
}
