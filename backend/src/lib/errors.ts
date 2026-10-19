// Códigos do envelope de erro — CONTRATO-API.md §2.
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'FORBIDDEN'
  | 'REGISTRATION_CLOSED'
  | 'INVALID_EMAIL_CODE'
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
  invalidEmailCode: () =>
    new AppError(400, 'INVALID_EMAIL_CODE', 'Código inválido ou expirado. Peça um novo código.', [
      { field: 'emailCode', issue: 'invalid_or_expired' },
    ]),
  emailDisabled: () => new AppError(503, 'SERVICE_UNAVAILABLE', 'O envio de e-mail não está configurado no servidor.'),
  accountDisabled: () => new AppError(403, 'FORBIDDEN', 'Sua conta está bloqueada. Fale com o administrador.'),
  directAccess: () => new AppError(403, 'FORBIDDEN', 'Acesso direto à API não é permitido.'),
  crossSite: () => new AppError(403, 'FORBIDDEN', 'Requisição de outro site recusada.'),
  adminOnly: () => new AppError(403, 'FORBIDDEN', 'Acesso restrito ao administrador.'),
  emailTaken: () => new AppError(409, 'CONFLICT', 'Já existe uma conta com este e-mail.'),
  cannotChangeSelf: () => new AppError(422, 'UNPROCESSABLE', 'Você não pode fazer isso com a sua própria conta.'),
  notFound: () => new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.'),
  rateLimited: (retryAfterSeconds?: number) =>
    new AppError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde um pouco e tente de novo.', undefined, retryAfterSeconds),
  serviceUnavailable: () => new AppError(503, 'SERVICE_UNAVAILABLE', 'Serviço indisponível no momento. Tente de novo em instantes.'),
};
