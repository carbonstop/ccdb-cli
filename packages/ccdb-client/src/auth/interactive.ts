import { spawn } from 'node:child_process';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { emitKeypressEvents } from 'node:readline';
import { OAuthClient, verifyCallback, type PendingAuthorization } from './oauth.js';
import { validUrl } from '../config.js';
import { CcdbError } from '../errors.js';

/** Explicit login only. URLs are passed as arguments, never shell commands. */
export async function openBrowser(url: string): Promise<boolean> {
  validUrl(url);
  const [command, args] =
    process.platform === 'win32'
      ? (['rundll32.exe', ['url.dll,FileProtocolHandler', url]] as const)
      : process.platform === 'darwin'
      ? (['open', [url]] as const)
      : (['xdg-open', [url]] as const);
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: 'ignore', windowsHide: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

export async function readSecret(signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (!process.stdin.isTTY) {
    let value = '';
    for await (const chunk of process.stdin) {
      signal?.throwIfAborted();
      value += chunk.toString();
      if (value.length > 4096) throw new CcdbError('INVALID_ARGUMENT', 'Key 输入过长', 400);
    }
    return value.trim();
  }
  process.stderr.write('输入完整 API Key（不会回显）：');
  emitKeypressEvents(process.stdin);
  const originalRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error?: unknown) => {
      process.stdin.off('keypress', key);
      signal?.removeEventListener('abort', abort);
      process.stdin.setRawMode(originalRaw);
      process.stdin.pause();
      process.stderr.write('\n');
      error ? reject(error) : resolve(value.trim());
    };
    const abort = () => done(signal?.reason || new DOMException('Cancelled', 'AbortError'));
    const key = (str: string, event: { name?: string; ctrl?: boolean; meta?: boolean }) => {
      if (event?.ctrl && event.name === 'c')
        return done(new DOMException('Cancelled', 'AbortError'));
      if (event?.name === 'return') return done();
      if (event?.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (str && !event?.ctrl && !event?.meta && !/[\x00-\x1f\x7f]/.test(str)) {
        value += str;
        if (value.length > 4096) done(new CcdbError('INVALID_ARGUMENT', 'Key 输入过长', 400));
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
    process.stdin.on('keypress', key);
  });
}

export interface CallbackListener {
  result: Promise<URL>;
  close(): Promise<void>;
}

/** Only static messages are rendered: never put authorization codes or tokens in HTML. */
function callbackPage(
  res: ServerResponse,
  status: number,
  title: string,
  message: string,
  completed?: () => void,
) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.writeHead(status);
  res.end(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Carbon Agent</title></head><body><main><h1>${title}</h1><p>${message}</p><p>你可以关闭此页面并返回终端。</p></main></body></html>`,
    completed,
  );
}
/** Bind before launching the browser; do not silently choose another port. */
export async function listenForCallback(
  pending: PendingAuthorization,
  signal?: AbortSignal,
  complete?: (callback: URL) => Promise<void>,
): Promise<CallbackListener> {
  signal?.throwIfAborted();
  const target = new URL(pending.redirectUri);
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    !target.port
  )
    throw new CcdbError(
      'INVALID_CONFIG',
      '本地 PKCE 回调需使用已登记的 loopback HTTP 地址和固定端口',
    );
  // Use the already-discovered authorization page, never a redirect supplied by the callback.
  const resultPage = complete ? validUrl(pending.url) : undefined;
  const finish = (res: ServerResponse, outcome: string, done: () => void) => {
    const destination = new URL(resultPage!);
    destination.search = '';
    destination.hash = new URLSearchParams({
      ccdb_result: outcome,
      state: pending.state,
    }).toString();
    res.writeHead(303, { Location: destination.toString() });
    res.end(done);
  };
  let resolve!: (url: URL) => void,
    reject!: (error: unknown) => void,
    settled = false;
  const result = new Promise<URL>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Avoid an unhandled rejection while the caller is opening the browser.
  void result.catch(() => {});
  const server: Server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' || req.headers.host !== target.host || settled) {
      callbackPage(res, 400, '无效的授权回调', '请返回原应用重新发起授权。');
      return;
    }
    const url = new URL(req.url || '/', target.origin);
    try {
      verifyCallback(url, pending);
    } catch (error) {
      if (error instanceof CcdbError && error.code === 'access_denied') {
        settled = true;
        if (complete) {
          finish(res, 'cancelled', () => reject(error));
          return;
        }
        callbackPage(res, 200, '已取消授权', '本次请求未获得访问权限。', () => reject(error));
        return;
      }
      callbackPage(res, 400, '回调校验失败', '请返回原授权页面。');
      return;
    }
    settled = true;
    if (complete) {
      // Do not report success until token exchange AND credential persistence finish.
      void Promise.resolve()
        .then(() => complete(url))
        .then(
          () => finish(res, 'success', () => resolve(url)),
          (error) => finish(res, 'error', () => reject(error)),
        );
      return;
    }
    // 先完成响应写出再交换令牌；此时尚不能宣称登录已成功。
    callbackPage(res, 200, '已收到授权回调', '正在完成登录，请在终端查看最终结果。', () =>
      resolve(url),
    );
  });
  await new Promise<void>((yes, no) => {
    server.once('error', () =>
      no(new CcdbError('CALLBACK_UNAVAILABLE', '回调端口无法监听；请关闭占用程序或改用设备码登录')),
    );
    server.listen(Number(target.port), target.hostname === '[::1]' ? '::1' : target.hostname, () =>
      yes(),
    );
  });
  const abort = () => {
    if (!settled) {
      settled = true;
      reject(signal?.reason || new DOMException('Cancelled', 'AbortError'));
    }
  };
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      reject(new CcdbError('LOGIN_TIMEOUT', '等待授权超时，请重新登录'));
    }
  }, Math.max(1, 600000 - (Date.now() - pending.createdAt)));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return {
    result,
    close: async () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      await new Promise<void>((yes) => {
        // 正常关闭等待在途响应完成；仅对超时连接强制关闭，避免 CLI 永久挂起。
        const forceClose = setTimeout(() => server.closeAllConnections(), 2000);
        forceClose.unref();
        server.close(() => {
          clearTimeout(forceClose);
          yes();
        });
        server.closeIdleConnections();
      });
    },
  };
}

export async function interactiveLogin(
  auth: OAuthClient,
  method: string,
  noBrowser: boolean,
  notify: (value: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  if (method === 'api-key') {
    await auth.saveKey(await readSecret(signal));
    return { authenticated: true, kind: 'api-key', profile: auth.config.profile };
  }
  if (method === 'device') {
    const device = await auth.deviceStart(signal);
    const url = device.verification_uri_complete || device.verification_uri;
    notify({
      event: 'authorization_pending',
      verificationUri: url,
      userCode: device.user_code,
      expiresIn: device.expires_in,
    });
    if (!noBrowser && !(await openBrowser(url)))
      notify({ event: 'browser_unavailable', message: '请手动打开上面的授权链接' });
    await auth.pollDevice(device, signal);
  } else if (method === 'pkce') {
    const pending = await auth.createAuthorization(signal);
    const listener = await listenForCallback(pending, signal, async (callback) => {
      await auth.exchangeCallback(callback, pending, signal);
    });
    try {
      notify({ event: 'authorization_pending', authorizationUri: pending.url });
      if (!noBrowser && !(await openBrowser(pending.url)))
        notify({ event: 'browser_unavailable', message: '请手动打开上面的授权链接' });
      await listener.result;
    } finally {
      await listener.close();
    }
  } else throw new CcdbError('INVALID_ARGUMENT', 'method 仅支持 device、pkce、api-key', 400);
  return { authenticated: true, kind: 'oauth', profile: auth.config.profile };
}
