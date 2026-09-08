import { parseArgs } from 'node:util';
import { CcdbClient, CcdbError, asError, exitCode, type Config } from 'ccdb-client';
import { appConfig } from './config.js';
import { interactiveLogin } from 'ccdb-client/auth/interactive';
import { humanOutput, loginProgress } from './output.js';
import { helpText } from './help.js';

export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const wantsJson = args.includes('--json');
  const cancel = new AbortController();
  const interrupted = () => cancel.abort(new DOMException('Cancelled', 'AbortError'));
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    const { values: v, positionals: p } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        json: { type: 'boolean' },
        profile: { type: 'string' },
        timeout: { type: 'string' },
        method: { type: 'string' },
        'no-browser': { type: 'boolean' },
        revoke: { type: 'boolean' },
        language: { type: 'string' },
        'accounting-type': { type: 'string' },
        country: { type: 'string', multiple: true },
        year: { type: 'string', multiple: true },
        'source-level': { type: 'string', multiple: true },
        limit: { type: 'string' },
      },
    });
    if (v.help || (!p.length && !v.version)) {
      process.stdout.write(helpText(p));
      return 0;
    }
    if (v.version) {
      process.stdout.write(
        v.json ? JSON.stringify({ name: 'ccdb-cli', version: '0.1.2' }) + '\n' : 'ccdb-cli 0.1.2\n',
      );
      return 0;
    }
    const overrides: Partial<Config> = {};
    if (v.profile) overrides.profile = v.profile;
    if (v.timeout) overrides.timeoutMs = Number(v.timeout);
    const settings = appConfig(env, overrides);
    const client = new CcdbClient(settings);
    let output: unknown;
    const command = p.slice(0, 2).join(' ');
    const allowed: Record<string, string[]> = {
      'auth login': ['method', 'no-browser'],
      'auth status': [],
      'auth logout': ['revoke'],
      'factor search': ['language', 'accounting-type', 'country', 'year', 'source-level', 'limit'],
      'factor detail': ['language'],
      doctor: [],
    };
    const selected = p[0] === 'doctor' ? 'doctor' : command;
    if (!allowed[selected]) throw new CcdbError('INVALID_ARGUMENT', '未知命令，请运行 --help', 400);
    for (const key of Object.keys(v))
      if (!['profile', 'json', 'timeout'].includes(key) && !allowed[selected].includes(key))
        throw new CcdbError('INVALID_ARGUMENT', `当前命令不支持 --${key}`, 400);
    const expected = selected.startsWith('factor ') ? 3 : selected === 'doctor' ? 1 : 2;
    if (p.length !== expected)
      throw new CcdbError('INVALID_ARGUMENT', '命令参数数量不正确，请运行 --help', 400);
    if (selected === 'auth login') {
      const notify = (event: Record<string, unknown>) => {
        if (v.json) process.stdout.write(JSON.stringify(event) + '\n');
        else process.stderr.write(loginProgress(event) + '\n');
      };
      output = await interactiveLogin(
        client.auth,
        v.method || 'device',
        !!v['no-browser'],
        notify,
        cancel.signal,
      );
      if (settings.apiKey)
        output = {
          ...(output as object),
          warning: 'CCDB_API_KEY 环境变量优先于保存的凭证；若要使用 OAuth 请从宿主中移除该变量',
        };
    } else if (selected === 'auth status') output = await client.auth.status();
    else if (selected === 'auth logout')
      output = await client.auth.logout(!!v.revoke, cancel.signal);
    else if (selected === 'factor search') {
      output = await client.search(
        {
          query: p[2],
          language: v.language as 'zh' | 'en' | undefined,
          accountingType: v['accounting-type'] as 'product' | 'enterprise' | undefined,
          filters:
            v.country || v.year || v['source-level']
              ? { country: v.country, year: v.year?.map(Number), sourceLevel: v['source-level'] }
              : undefined,
          limit: v.limit === undefined ? undefined : Number(v.limit),
        },
        cancel.signal,
      );
    } else if (selected === 'factor detail')
      output = await client.detail(p[2], (v.language || 'zh') as 'zh' | 'en', cancel.signal);
    else {
      const metadata = await client.auth.discover(cancel.signal);
      output = {
        ok: true,
        node: process.version,
        profile: settings.profile,
        apiBase: settings.apiBase,
        issuer: settings.issuer,
        resource: settings.resource,
        agentWeb: settings.webBase,
        clientId: settings.clientId,
        authorizationEndpoint: metadata.authorization_endpoint,
        tokenEndpoint: metadata.token_endpoint,
        credential: await client.auth.status(),
        factorQuotaConsumed: false,
      };
    }
    process.stdout.write(
      (v.json ? JSON.stringify(output) : humanOutput(output, v.language)) + '\n',
    );
    return 0;
  } catch (error) {
    const e =
      error instanceof TypeError &&
      (error as NodeJS.ErrnoException).code?.startsWith('ERR_PARSE_ARGS')
        ? new CcdbError('INVALID_ARGUMENT', '命令行参数不合法，请运行 --help', 400)
        : asError(error);
    (wantsJson ? process.stdout : process.stderr).write(
      (wantsJson
        ? JSON.stringify({ error: e.toJSON() })
        : `${e.code}: ${e.message}${e.requestId ? ` [${e.requestId}]` : ''}`) + '\n',
    );
    return exitCode(e);
  } finally {
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}
