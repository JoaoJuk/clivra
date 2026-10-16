// Códigos do envelope de erro — CONTRATO-API.md §2.
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'FORBIDDEN'
  | 'REGISTRATION_CLOSED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_TRANSACTION'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ErrorDetail {
  field: string;
  issue: string;
}

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
    // Vira o header Retry-After (contrato §2, código 429).
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Sua sessão expirou. Entre novamente.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'),
  invalidRefreshToken: () => new AppError(401, 'INVALID_REFRESH_TOKEN', 'Sua sessão expirou. Entre novamente.'),
  invalidSetupCode: () => new AppError(403, 'FORBIDDEN', 'Código de configuração inválido.'),
  registrationClosed: () => new AppError(403, 'REGISTRATION_CLOSED', 'Já existe uma conta cadastrada neste app.'),
  notFound: () => new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.'),
  rateLimited: (retryAfterSeconds?: number) =>
    new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde um pouco e tente de novo.', undefined, retryAfterSeconds),
  serviceUnavailable: () => new AppError(503, 'SERVICE_UNAVAILABLE', 'Serviço indisponível no momento. Tente de novo em instantes.'),
};
