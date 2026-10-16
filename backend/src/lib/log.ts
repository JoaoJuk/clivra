// P4: erros vão para o log SEM mensagem nem parâmetros. Erros do Drizzle/Postgres
// carregam a query, os valores (`params`) e `detail` ("Key (email)=(...)") — tudo
// isso pode ter dado financeiro ou pessoal. Ficam só o tipo, o código e as linhas
// da stack (que apontam o arquivo, não o dado).
export interface SafeLoggedError {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
}

export function serializeErrorSafely(error: unknown): SafeLoggedError {
  if (!(error instanceof Error)) return { type: typeof error, message: '[omitida — P4]', stack: '' };
  const cause = 'cause' in error ? error.cause : undefined;
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
      ? value.code
      : undefined;
  return {
    type: error.name,
    message: '[omitida — P4]',
    code: code(error),
    causeType: cause instanceof Error ? cause.name : undefined,
    causeCode: code(cause), // SQLSTATE do Postgres, ex.: 23505
    stack: (error.stack ?? '')
      .split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .slice(0, 15)
      .join('\n'),
  };
}
