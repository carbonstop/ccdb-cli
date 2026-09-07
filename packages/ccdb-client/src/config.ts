import { homedir } from 'node:os';
import { join } from 'node:path';
import { CcdbError } from './errors.js';

export interface Config {
  profile: string;
  apiBase: string;
  issuer: string;
  resource: string;
  webBase: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  apiKey?: string;
  configDir: string;
  store: 'auto' | 'file';
  timeoutMs: number;
}
export function validUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CcdbError('INVALID_CONFIG', '服务地址必须是完整 URL');
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new CcdbError(
      'INVALID_CONFIG',
      '服务地址必须使用 HTTPS（本机地址除外），且不能含账号或片段',
    );
  return url;
}
export function config(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Config> = {},
): Config {
  const profile = overrides.profile || env.CCDB_PROFILE || 'production';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile))
    throw new CcdbError('INVALID_CONFIG', 'profile 名称无效');
  const presets: Record<string, [string, string]> = {
    local: ['http://127.0.0.1:8880', 'http://127.0.0.1:3100'],
    pre: ['https://gateway-pre.carbonstop.com', 'https://agent-pre.carbonstop.com'],
    production: ['https://gateway.carbonstop.com', 'https://agent.carbonstop.com'],
  };
  if (!presets[profile] && !env.CCDB_API_BASE && !overrides.apiBase)
    throw new CcdbError('INVALID_CONFIG', '自定义 profile 需要配置 CCDB_API_BASE');
  const [base, web] = presets[profile] || ['', ''];
  const apiBase = (overrides.apiBase || env.CCDB_API_BASE || base).replace(/\/$/, '');
  const timeoutMs = overrides.timeoutMs ?? Number(env.CCDB_TIMEOUT_MS || 30000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000)
    throw new CcdbError('INVALID_CONFIG', 'timeout 需要在 100～120000 毫秒内');
  const result: Config = {
    profile,
    apiBase,
    issuer: env.CCDB_OAUTH_ISSUER || `${apiBase}/auth`,
    resource: env.CCDB_RESOURCE || `${apiBase}/management/api/ccdb/v1`,
    webBase: env.CCDB_AGENT_WEB || web,
    clientId: env.CCDB_CLIENT_ID || 'ccdb-connect-local',
    redirectUri: env.CCDB_REDIRECT_URI || 'http://127.0.0.1:3210/callback',
    scope: 'ccdb.factor.search ccdb.factor.read offline_access',
    apiKey: env.CCDB_API_KEY || undefined,
    configDir:
      env.CCDB_CONFIG_DIR ||
      join(
        env.LOCALAPPDATA || env.XDG_CONFIG_HOME || join(homedir(), '.config'),
        'Carbonstop',
        'CCDB-Connect',
      ),
    store: env.CCDB_AUTH_STORE === 'file' ? 'file' : 'auto',
    timeoutMs,
    ...overrides,
  };
  for (const field of ['apiBase', 'issuer', 'resource', 'webBase', 'redirectUri'] as const)
    validUrl(result[field]);
  if (
    new URL(result.apiBase).search ||
    new URL(result.issuer).search ||
    new URL(result.resource).search
  )
    throw new CcdbError('INVALID_CONFIG', 'API/issuer/resource 不能含 Query 参数');
  if (result.apiKey && /\s|\*/.test(result.apiKey))
    throw new CcdbError('INVALID_CONFIG', '请配置不含空白或掩码的完整 CCDB API Key');
  return result;
}
