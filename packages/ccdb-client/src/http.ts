import { CcdbError } from './errors.js';

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const result = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}
export async function jsonRequest(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: 'error',
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && ['AbortError', 'TimeoutError'].includes(e.name)) throw e;
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    const reason =
      (
        {
          ECONNREFUSED: '连接被拒绝，服务可能未启动',
          ENOTFOUND: 'DNS 域名解析失败',
          EAI_AGAIN: 'DNS 暂时不可用',
          ETIMEDOUT: '连接超时',
          CERT_HAS_EXPIRED: 'TLS 证书已过期',
          UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS 证书无法验证',
          DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS 证书不受信任',
        } as Record<string, string>
      )[cause || ''] || '请检查服务、网络和环境配置';
    throw new CcdbError('NETWORK_ERROR', `无法连接 ${new URL(url).origin}：${reason}`);
  }
  const requestId = response.headers.get('X-Request-Id') || undefined;
  const body = await readResponseObject(response, requestId);
  if (
    !response.ok ||
    body.error ||
    (typeof body.code === 'number' && body.code !== 0 && body.code !== 200)
  ) {
    const category =
      typeof body.error === 'string'
        ? body.error
        : (
            {
              401: 'UNAUTHENTICATED',
              403: 'FORBIDDEN',
              404: 'NOT_FOUND',
              429: 'RATE_LIMITED',
            } as Record<number, string>
          )[response.status] || 'UPSTREAM_ERROR';
    let message = String(body.error_description || body.msg || `HTTP ${response.status}`);
    message = redactRequestSecrets(message, init);
    throw new CcdbError(
      category,
      message,
      response.status,
      typeof body.requestId === 'string' ? body.requestId : requestId,
      retryAfter(response.headers.get('Retry-After')),
      body.error || body.code,
    );
  }
  return body;
}

/** 先限制大小，再解析 JSON；失败响应不能当成空结果返回。 */
async function readResponseObject(response: Response, requestId?: string) {
  // Bound memory use even when an upstream accidentally returns a large HTML page.
  const reader = response.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new CcdbError('INVALID_RESPONSE', '响应超过大小上限', response.status, requestId);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  let body: any;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new CcdbError(
      response.status === 429 ? 'RATE_LIMITED' : 'INVALID_RESPONSE',
      `服务返回非 JSON 内容（HTTP ${response.status}）`,
      response.status,
      requestId,
      retryAfter(response.headers.get('Retry-After')),
    );
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new CcdbError('INVALID_RESPONSE', '服务返回对象结构不合法', response.status, requestId);
  return body;
}

/** 上游可能回显请求凭证；输出错误前按本次真实入参精确去除。 */
function redactRequestSecrets(message: string, init: RequestInit): string {
  const requestHeaders = new Headers(init.headers);
  const secrets = [
    requestHeaders.get('X-API-Key'),
    requestHeaders.get('X-CCDB-Execution-Context'),
    requestHeaders.get('Authorization')?.replace(/^Bearer\s+/i, ''),
  ];
  if (init.body instanceof URLSearchParams) {
    for (const name of ['refresh_token', 'device_code', 'code', 'code_verifier', 'token']) {
      secrets.push(init.body.get(name));
    }
  }
  for (const secret of secrets) {
    if (secret) {
      message = message.split(secret).join('[REDACTED]');
    }
  }
  return message;
}
