import { config as loadConfig, type Config } from './config.js';
import {
  searchSchema,
  searchResponseSchema,
  detailInputSchema,
  detailResponseSchema,
  type SearchRequest,
  type FactorClient,
} from './contracts.js';
import { jsonRequest } from './http.js';
import { CcdbError } from './errors.js';
import { OAuthClient } from './auth/oauth.js';
import { FileCredentialStore, type CredentialStore } from './auth/store.js';

export class CcdbClient implements FactorClient {
  readonly auth: OAuthClient;
  constructor(
    readonly config: Config = loadConfig(),
    store: CredentialStore = new FileCredentialStore(config),
    readonly fetcher: typeof fetch = fetch,
  ) {
    this.auth = new OAuthClient(config, store, fetcher);
  }
  private async request(path: string, body?: unknown, signal?: AbortSignal) {
    const credential = await this.auth.credential(signal);
    const run = (headers: Record<string, string>) =>
      jsonRequest(
        this.fetcher,
        `${this.config.apiBase}/management/api/ccdb/v1${path}`,
        {
          method: body === undefined ? 'GET' : 'POST',
          signal,
          headers: {
            Accept: 'application/json',
            ...headers,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        this.config.timeoutMs,
      );
    try {
      return await run(credential.headers);
    } catch (error) {
      if (credential.kind === 'oauth' && error instanceof CcdbError && error.httpStatus === 401) {
        const refreshed = await this.auth.credential(signal, credential.accessToken);
        return run(refreshed.headers);
      }
      throw error;
    }
  }
  async search(input: SearchRequest, signal?: AbortSignal) {
    const result = await this.request('/factors/search', searchSchema.parse(input), signal);
    const parsed = searchResponseSchema.safeParse(result);
    if (!parsed.success) throw new CcdbError('INVALID_RESPONSE', '搜索响应字段不符合 CCDB 契约');
    return parsed.data;
  }
  async detail(factorId: string, language: 'zh' | 'en' = 'zh', signal?: AbortSignal) {
    const input = detailInputSchema.parse({ factorId, language });
    const result = await this.request(
      `/factors/${input.factorId}?language=${input.language}`,
      undefined,
      signal,
    );
    const parsed = detailResponseSchema.safeParse(result);
    if (!parsed.success || parsed.data.data.factorId !== factorId)
      throw new CcdbError('INVALID_RESPONSE', '详情响应 ID 或字段不符合 CCDB 契约');
    return parsed.data;
  }
}
