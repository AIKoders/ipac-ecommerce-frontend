/**
 * The one error type the API layer throws, shaped after Kart's RFC 9457
 * problem+json (`code`, `status`, `detail`, per-field `errors`). UI code
 * branches on `code`, never on message text.
 */
export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid'
  | 'rate_limited'
  | 'internal_error'
  | 'unavailable'
  | 'network_error'
  | (string & {});

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly errors: FieldError[];
  readonly requestId: string | null;

  constructor(init: { code: ApiErrorCode; status: number; message: string; errors?: FieldError[]; requestId?: string | null }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId ?? null;
  }

  static notFound(what: string): ApiError {
    return new ApiError({ code: 'not_found', status: 404, message: `${what} was not found.` });
  }

  static unauthenticated(): ApiError {
    return new ApiError({ code: 'unauthenticated', status: 401, message: 'Sign in to continue.' });
  }

  static invalid(errors: FieldError[]): ApiError {
    return new ApiError({ code: 'invalid', status: 422, message: 'Some fields are not valid.', errors });
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
