import type { Response } from 'express';
import { ZodError } from 'zod';

type ErrorSourceOptions = {
  fallbackMessage: string;
  source?: string;
  exposeMessage?: boolean;
  message?: string;
  [key: string]: unknown;
};

type ClassifiedApiError = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
  retryAfterSeconds?: number;
};

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const maybeStatus = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { status?: unknown; statusCode?: unknown }).statusCode;
  return typeof maybeStatus === 'number' && Number.isInteger(maybeStatus)
    ? maybeStatus
    : undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === '57014' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('query read timeout') ||
    message.includes('statement timeout')
  );
}

function classifyApiError(
  error: unknown,
  options: ErrorSourceOptions,
): ClassifiedApiError {
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: options.fallbackMessage,
      retryable: false,
      details: error.errors,
    };
  }

  const explicitStatus = getErrorStatus(error);
  if (explicitStatus && explicitStatus >= 400 && explicitStatus < 600) {
    return {
      status: explicitStatus,
      code: explicitStatus === 422 ? 'BUSINESS_RULE_BLOCKED' : 'REQUEST_FAILED',
      message: options.exposeMessage !== false ? getErrorMessage(error) : options.fallbackMessage,
      retryable: explicitStatus === 408 || explicitStatus === 429 || explicitStatus === 503,
      details: typeof error === 'object' && error !== null && 'blockingReasons' in error
        ? { blockingReasons: (error as { blockingReasons?: unknown }).blockingReasons }
        : undefined,
      retryAfterSeconds: explicitStatus === 503 ? 1 : undefined,
    };
  }

  const code = getErrorCode(error);
  if (code === '23505') {
    return {
      status: 409,
      code: 'CONFLICT',
      message: options.exposeMessage ? getErrorMessage(error) : options.fallbackMessage,
      retryable: false,
    };
  }

  const message = getErrorMessage(error);
  if (message.includes('duplicate key') || message.includes('unique constraint')) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: options.exposeMessage ? message : options.fallbackMessage,
      retryable: false,
    };
  }

  if (code === '23503') {
    return {
      status: 409,
      code: 'RELATED_RECORD_MISSING',
      message: options.exposeMessage ? getErrorMessage(error) : options.fallbackMessage,
      retryable: false,
    };
  }

  if (code === '40001' || code === '40P01') {
    return {
      status: 503,
      code: 'DB_RETRYABLE',
      message: 'Database was busy, please retry.',
      retryable: true,
      retryAfterSeconds: 1,
    };
  }

  if (isTimeoutError(error)) {
    return {
      status: 503,
      code: 'DB_OR_UPSTREAM_TIMEOUT',
      message: 'The request timed out, please retry.',
      retryable: true,
      retryAfterSeconds: 2,
    };
  }

  if (
    message.includes('not configured') ||
    message.includes('credentials missing') ||
    message.includes('environment variable is not set')
  ) {
    return {
      status: 503,
      code: 'SERVICE_NOT_CONFIGURED',
      message: options.exposeMessage ? message : options.fallbackMessage,
      retryable: false,
    };
  }

  if (options.exposeMessage && /\bnot found\b/i.test(message)) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message,
      retryable: false,
    };
  }

  if (
    options.exposeMessage &&
    /\b(invalid|cannot|already|must|required|missing)\b/i.test(message)
  ) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message,
      retryable: false,
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: options.fallbackMessage,
    retryable: false,
  };
}

export function sendApiError(
  res: Response,
  error: unknown,
  options: ErrorSourceOptions,
) {
  const classified = classifyApiError(error, options);
  const requestId = res.locals.requestId;
  const {
    fallbackMessage: _fallbackMessage,
    source: _source,
    exposeMessage: _exposeMessage,
    message: _message,
    ...extra
  } = options;

  if (classified.retryAfterSeconds) {
    res.setHeader('Retry-After', String(classified.retryAfterSeconds));
  }

  console.error('[api-error]', {
    requestId,
    source: options.source,
    status: classified.status,
    code: classified.code,
    retryable: classified.retryable,
    message: getErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return res.status(classified.status).json({
    error: classified.message,
    code: classified.code,
    requestId,
    retryable: classified.retryable,
    ...(classified.details !== undefined ? { details: classified.details } : {}),
    ...extra,
  });
}
