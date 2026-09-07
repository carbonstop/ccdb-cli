import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import type { Config } from '../config.js';
import { CcdbError } from '../errors.js';

export interface Credentials {
  kind: 'oauth' | 'api-key';
  issuer: string;
  clientId: string;
  resource: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  apiKey?: string;
  /** Durable marker: never replay a refresh token after an ambiguous exchange. */
  refreshInProgress?: boolean;
}
export interface CredentialStore {
  read(): Promise<Credentials | undefined>;
  write(value: Credentials): Promise<void>;
  clear(): Promise<void>;
  locked<T>(fn: () => Promise<T>): Promise<T>;
}
function command(program: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      program,
      args,
      { windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error)
          reject(
            new CcdbError(
              'CREDENTIAL_STORE_ERROR',
              '系统凭证存储不可用；检查系统密钥服务，或显式配置 CCDB_AUTH_STORE=file 使用受限文件存储',
            ),
          );
        else resolve(stdout.trim());
      },
    );
    child.stdin?.on('error', () => {});
    child.stdin?.end(input || '');
  });
}
async function dpapi(value: string, encrypt: boolean) {
  const operation = encrypt ? 'Protect' : 'Unprotect';
  const script = `Add-Type -AssemblyName System.Security; $payload = [Convert]::FromBase64String([Console]::In.ReadToEnd()); $result = [Security.Cryptography.ProtectedData]::${operation}($payload, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], value);
}
export class FileCredentialStore implements CredentialStore {
  readonly key: string;
  readonly file: string;
  constructor(readonly config: Config) {
    this.key = createHash('sha256')
      .update(JSON.stringify([config.profile, config.issuer, config.clientId, config.resource]))
      .digest('hex');
    this.file = join(config.configDir, `${this.key}.json`);
  }
  async read(): Promise<Credentials | undefined> {
    let envelope: { format: string; data?: string };
    try {
      envelope = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error: any) {
      if (error.code === 'ENOENT') return undefined;
      throw new CcdbError('CREDENTIAL_STORE_ERROR', '凭证文件不可读，未覆盖原文件');
    }
    let encoded = envelope.data || '';
    if (envelope.format === 'dpapi' && process.platform === 'win32')
      encoded = await dpapi(encoded, false);
    else if (envelope.format === 'keychain' && process.platform === 'darwin')
      encoded = await command('security', [
        'find-generic-password',
        '-s',
        'ccdb-connect',
        '-a',
        this.key,
        '-w',
      ]);
    else if (envelope.format === 'secret-service' && process.platform === 'linux')
      encoded = await command('secret-tool', [
        'lookup',
        'service',
        'ccdb-connect',
        'profile',
        this.key,
      ]);
    else if (envelope.format !== 'file')
      throw new CcdbError('CREDENTIAL_STORE_ERROR', '凭证存储平台不一致');
    try {
      const result = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Credentials;
      if (
        !['oauth', 'api-key'].includes(result.kind) ||
        result.issuer !== this.config.issuer ||
        result.clientId !== this.config.clientId ||
        result.resource !== this.config.resource
      )
        throw new Error();
      return result;
    } catch {
      throw new CcdbError('CREDENTIAL_STORE_ERROR', '凭证内容或环境绑定无效，请重新登录');
    }
  }
  async write(value: Credentials) {
    await mkdir(this.config.configDir, { recursive: true, mode: 0o700 });
    const encoded = Buffer.from(JSON.stringify(value)).toString('base64');
    let envelope: { format: string; data?: string };
    if (this.config.store === 'file') envelope = { format: 'file', data: encoded };
    else if (process.platform === 'win32')
      envelope = { format: 'dpapi', data: await dpapi(encoded, true) };
    else if (process.platform === 'darwin') {
      // Secret goes through stdin to the OS utility, never in the process argument list.
      await command(
        'security',
        ['-i'],
        `add-generic-password -U -s ccdb-connect -a ${this.key} -w ${encoded}\nquit\n`,
      );
      envelope = { format: 'keychain' };
    } else if (process.platform === 'linux') {
      await command(
        'secret-tool',
        ['store', '--label=CCDB Connect', 'service', 'ccdb-connect', 'profile', this.key],
        encoded,
      );
      envelope = { format: 'secret-service' };
    } else
      throw new CcdbError(
        'CREDENTIAL_STORE_ERROR',
        '当前系统没有自动凭证存储适配，请显式选择 file 存储',
      );
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async clear() {
    let envelope: any;
    try {
      envelope = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (e: any) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    if (envelope.format === 'keychain')
      await command('security', ['delete-generic-password', '-s', 'ccdb-connect', '-a', this.key]);
    if (envelope.format === 'secret-service')
      await command('secret-tool', ['clear', 'service', 'ccdb-connect', 'profile', this.key]);
    await unlink(this.file);
  }
  async locked<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.config.configDir, { recursive: true, mode: 0o700 });
    let compromised = false;
    const release = await lockfile
      .lock(this.file, {
        realpath: false,
        stale: 120000,
        update: 10000,
        retries: { retries: 40, minTimeout: 100, maxTimeout: 500 },
        onCompromised: () => {
          compromised = true;
        },
      })
      .catch(() => {
        throw new CcdbError('CREDENTIAL_LOCKED', '另一进程正在更新凭证，请稍后重试');
      });
    try {
      if (compromised) throw new CcdbError('CREDENTIAL_LOCKED', '凭证锁已失效');
      return await fn();
    } finally {
      await release();
    }
  }
}
