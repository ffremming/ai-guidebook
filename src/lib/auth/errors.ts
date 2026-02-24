export type AuthErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: 401 | 403;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = code === 'AUTH_REQUIRED' ? 401 : 403;
  }
}
