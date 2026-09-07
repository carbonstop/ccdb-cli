import { z } from 'zod';
export function redact(value: string): string {
  return value
    .replace(/\b(?:sk-cs-|csk_|coa_|cor_)[A-Za-z0-9._-]{6,}/g, '[REDACTED]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]');
}
export class CcdbError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus?: number,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly upstreamCode?: string | number,
  ) {
    super(redact(message));
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      requestId: this.requestId,
      retryAfterSeconds: this.retryAfterSeconds,
      upstreamCode: this.upstreamCode,
    };
  }
}
export function asError(e: unknown): CcdbError {
  if (e instanceof CcdbError) return e;
  if (e instanceof z.ZodError)
    return new CcdbError(
      'INVALID_ARGUMENT',
      e.issues.map((i) => `${i.path.join('.') || '参数'}: ${i.message}`).join('; '),
      400,
    );
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError'))
    return new CcdbError(
      e.name === 'TimeoutError' ? 'TIMEOUT' : 'CANCELLED',
      e.name === 'TimeoutError' ? '请求超时' : '操作已取消',
    );
  return new CcdbError('REQUEST_FAILED', e instanceof Error ? e.message : '请求失败');
}
export function exitCode(e: CcdbError) {
  if (e.httpStatus === 401 || ['login_required', 'invalid_grant'].includes(e.code)) return 3;
  if (e.httpStatus === 400 || e.code === 'INVALID_ARGUMENT' || e.code === 'INVALID_CONFIG')
    return 2;
  if (e.httpStatus === 403) return 4;
  if (e.httpStatus === 429) return 5;
  if (e.httpStatus === 404) return 7;
  if (e.code === 'CANCELLED') return 130;
  return 6;
}
