import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod';
import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError, type ErrorDetail, errors } from '../lib/errors.js';

function envelope(error: AppError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  };
}

function isClientError(error: unknown): error is FastifyError & { statusCode: number } {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  const { statusCode } = error;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
}

// Todo erro sai no envelope do contrato (§2). Stack trace nunca vai na resposta.
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (hasZodFastifySchemaValidationErrors(error)) {
      const details: ErrorDetail[] = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || 'body',
        issue: issue.message ?? 'valor inválido',
      }));
      appError = new AppError(400, 'VALIDATION_ERROR', 'Alguns campos estão inválidos.', details);
    } else if (isClientError(error)) {
      // JSON malformado, corpo grande demais, content-type errado etc.
      appError = new AppError(error.statusCode, 'VALIDATION_ERROR', 'A requisição não pôde ser entendida.');
    } else {
      request.log.error({ err: error }, 'erro inesperado');
      appError = new AppError(500, 'INTERNAL_ERROR', 'Algo deu errado do nosso lado. Tente de novo.');
    }

    if (appError.retryAfterSeconds !== undefined) reply.header('retry-after', String(appError.retryAfterSeconds));
    return reply.status(appError.statusCode).send(envelope(appError, request.id));
  });

  app.setNotFoundHandler((request, reply) => {
    const error = errors.notFound();
    return reply.status(404).send(envelope(error, request.id));
  });
}
