import type {
  AdminInvite,
  AdminUser,
  ApiErrorBody,
  AuthSession,
  Card,
  Category,
  CreateCardInput,
  CreateTransactionInput,
  IngestRawInput,
  IngestRawResponse,
  Insight,
  MonthSummary,
  Page,
  Question,
  Rule,
  Summary,
  SystemStatus,
  Transaction,
  User,
} from './types';

import { clearOfflineSession, logoutStorageKey, readStorage, rememberOfflineSession, writeStorage } from './sessionStorage';

const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: ApiErrorBody['error']['details'],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  const error = body?.error;
  return new ApiError(error?.message || 'Não foi possível concluir a solicitação.', response.status, error?.code || 'UNKNOWN_ERROR', error?.details);
}

function queryString(params: object = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.size ? `?${query}` : '';
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  cardId?: string;
  categoryId?: string;
  status?: string;
  statementMonth?: string;
  search?: string;
  minCents?: number;
  maxCents?: number;
  isRecurring?: boolean;
  tags?: string;
  limit?: number;
  cursor?: string;
  order?: 'asc' | 'desc';
}

export interface TransactionsResponse extends Page<Transaction> {
  summary: { totalCents: number; count: number };
}

export interface SummaryFilters {
  period?: 'month' | 'statement' | 'custom';
  month?: string;
  from?: string;
  to?: string;
  cardId?: string;
  groupBy?: 'category' | 'card' | 'day' | 'week' | 'group';
}

export class ApiClient {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshPromise: Promise<AuthSession> | null = null;

  private generation = 0;
  private loggingOut = false;

  get sessionVersion(): number { return this.generation; }

  private rememberSession(session: AuthSession): AuthSession {
    this.accessToken = session.accessToken;
    this.accessExpiresAt = Date.now() + session.expiresIn * 1000;
    rememberOfflineSession(session.user);
    return session;
  }

  clearSession(broadcast = false): void {
    this.generation += 1;
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.refreshPromise = null;
    clearOfflineSession();
    if (broadcast) writeStorage(logoutStorageKey, crypto.randomUUID());
    window.dispatchEvent(new Event('clivra:session-ended'));
  }

  private async authenticate(path: string, input: object): Promise<AuthSession> {
    const generation = this.generation;
    const logoutVersion = readStorage(logoutStorageKey);
    const session = await this.request<AuthSession>(path, { method: 'POST', body: JSON.stringify(input) }, false);
    if (generation !== this.generation || logoutVersion !== readStorage(logoutStorageKey)) {
      throw new ApiError('A sessão foi encerrada. Entre novamente.', 401, 'SESSION_ENDED');
    }
    return this.rememberSession(session);
  }

  async register(input: { email: string; password: string; name: string; setupCode?: string; emailCode: string }): Promise<AuthSession> {
    return this.authenticate('/v1/auth/register', input);
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    return this.authenticate('/v1/auth/login', input);
  }

  async refresh(): Promise<AuthSession> {
    if (this.loggingOut) throw new ApiError('Saída em andamento. Aguarde.', 409, 'SESSION_ENDING');
    if (this.refreshPromise) return this.refreshPromise;
    const generation = this.generation;
    this.refreshPromise = this.authenticate('/v1/auth/refresh', {}).catch((error: unknown) => {
      if (generation === this.generation && error instanceof ApiError && error.status === 401) this.clearSession();
      throw error;
    }).finally(() => {
      if (generation === this.generation) this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    this.loggingOut = true;
    try {
      // Aguarda a rotação em andamento antes de revogar o cookie mais recente.
      await this.refreshPromise?.catch(() => undefined);
      await this.request<void>('/v1/auth/logout', { method: 'POST' }, false);
      this.clearSession(true);
    } finally { this.loggingOut = false; }
  }

  emailCode(input: { email: string; purpose: 'register' | 'password_reset'; setupCode?: string }): Promise<{ expiresIn: number; resendIn: number }> {
    return this.request('/v1/auth/email-code', { method: 'POST', body: JSON.stringify(input) }, false);
  }

  async resetPassword(input: { email: string; emailCode: string; newPassword: string }): Promise<void> {
    await this.request<void>('/v1/auth/password-reset', { method: 'POST', body: JSON.stringify(input) }, false);
    this.clearSession(true);
  }

  registrationMode(): Promise<{ mode: 'owner_setup' | 'invite_only' }> {
    return this.request('/v1/auth/registration', {}, false);
  }

  // Painel admin (contrato §17).
  adminSystem(): Promise<SystemStatus> { return this.request('/v1/admin/system'); }
  adminUsers(): Promise<{ data: AdminUser[] }> { return this.request('/v1/admin/users'); }
  adminInvites(): Promise<{ data: AdminInvite[] }> { return this.request('/v1/admin/invites'); }
  adminInvite(email: string): Promise<AdminInvite> {
    return this.request('/v1/admin/invites', { method: 'POST', body: JSON.stringify({ email }) });
  }
  async adminRevokeInvite(id: string): Promise<void> {
    await this.request<void>(`/v1/admin/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async adminUserAction(id: string, action: 'disable' | 'enable' | 'revoke-sessions'): Promise<void> {
    await this.request<void>(`/v1/admin/users/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
  }

  async request<T>(path: string, init: RequestInit = {}, authenticated = true, retry = true): Promise<T> {
    if (authenticated && this.loggingOut) throw new ApiError('Saída em andamento. Aguarde.', 409, 'SESSION_ENDING');
    if (authenticated && (!this.accessToken || Date.now() >= this.accessExpiresAt - 30_000)) {
      await this.refresh();
    }

    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json; charset=utf-8');
    if (authenticated && this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);

    const generation = this.generation;
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
    if (authenticated && generation !== this.generation) throw new ApiError('A sessão foi encerrada.', 401, 'SESSION_ENDED');
    if (response.status === 401 && authenticated && retry) {
      await this.refresh();
      return this.request<T>(path, init, true, false);
    }
    if (!response.ok) throw await readError(response);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  health(): Promise<{ status: 'ok'; version: string }> {
    return this.request('/v1/health', {}, false);
  }

  me(): Promise<User> {
    return this.request('/v1/auth/me');
  }

  categories(): Promise<{ data: Category[] }> {
    return this.request('/v1/categories');
  }

  cards(includeArchived = false): Promise<Page<Card>> {
    return this.request(`/v1/cards${queryString({ includeArchived })}`);
  }

  createCard(input: CreateCardInput): Promise<Card> {
    return this.request('/v1/cards', { method: 'POST', body: JSON.stringify(input) });
  }

  updateCard(id: string, input: Partial<CreateCardInput> & { archived?: boolean }): Promise<Card> {
    return this.request(`/v1/cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  transactions(filters: TransactionFilters = {}): Promise<TransactionsResponse> {
    return this.request(`/v1/transactions${queryString(filters)}`);
  }

  createTransaction(input: CreateTransactionInput, force = false): Promise<{ transaction: Transaction; question?: Question | null }> {
    return this.request(`/v1/transactions${queryString({ force })}`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateTransaction(id: string, input: Partial<Transaction> & { learnRule?: boolean }): Promise<Transaction> {
    return this.request(`/v1/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  questions(cursor?: string): Promise<Page<Question>> {
    return this.request(`/v1/questions${queryString({ status: 'open', limit: 100, cursor })}`);
  }

  questionCount(): Promise<{ open: number }> {
    return this.request('/v1/questions/count');
  }

  answerQuestion(id: string, categoryId: string): Promise<{
    transaction: Transaction;
    affectedTransactionIds: string[];
    ruleCreated: { id: string; pattern: string; categoryId: string };
    remainingOpenQuestions: number;
  }> {
    return this.request(`/v1/questions/${encodeURIComponent(id)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ categoryId, learnRule: true, applyToSimilar: true }),
    });
  }

  summary(filters: SummaryFilters = {}): Promise<Summary> {
    return this.request(`/v1/summary${queryString(filters)}`);
  }

  summaryMonths(limit = 12): Promise<{ data: MonthSummary[] }> {
    return this.request(`/v1/summary/months${queryString({ limit })}`);
  }

  insights(month?: string): Promise<{ data: Insight[] }> {
    return this.request(`/v1/insights${queryString({ month })}`);
  }

  rules(cursor?: string): Promise<Page<Rule>> {
    return this.request(`/v1/rules${queryString({ cursor, limit: 100 })}`);
  }

  ingestRaw(input: IngestRawInput): Promise<IngestRawResponse> {
    return this.request('/v1/ingest/raw', { method: 'POST', body: JSON.stringify(input) });
  }

  ingestStatement(file: File, cardId: string): Promise<{
    imported: number;
    duplicatesSkipped: number;
    pendingCategory: number;
    transactions: Transaction[];
    errors: Array<{ line: number; reason: string }>;
  }> {
    const form = new FormData();
    form.set('file', file);
    form.set('cardId', cardId);
    return this.request('/v1/ingest/statement', { method: 'POST', body: form });
  }

  pushPublicKey(): Promise<{ publicKey: string }> {
    return this.request('/v1/push/public-key');
  }

  subscribePush(subscription: PushSubscription): Promise<{ id: string; createdAt: string }> {
    const json = subscription.toJSON();
    return this.request('/v1/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
    });
  }

  unsubscribePush(endpoint: string): Promise<void> {
    return this.request('/v1/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
  }

  testPush(): Promise<{ sent: boolean }> {
    return this.request('/v1/push/test', { method: 'POST' });
  }

  async exportTransactions(filters: { format?: 'csv' | 'json'; from?: string; to?: string; cardId?: string } = {}): Promise<Blob> {
    if (this.loggingOut) throw new ApiError('Saída em andamento. Aguarde.', 409, 'SESSION_ENDING');
    if (!this.accessToken || Date.now() >= this.accessExpiresAt - 30_000) await this.refresh();
    const path = `/v1/export${queryString(filters)}`;
    const generation = this.generation;
    const assertSessionActive = () => {
      if (this.loggingOut) throw new ApiError('Saída em andamento. Aguarde.', 409, 'SESSION_ENDING');
      if (generation !== this.generation) throw new ApiError('A sessão foi encerrada.', 401, 'SESSION_ENDED');
    };
    const doFetch = () => {
      assertSessionActive();
      return fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        credentials: 'include',
        cache: 'no-store',
      });
    };
    let response = await doFetch();
    assertSessionActive();
    if (response.status === 401) {
      await this.refresh();
      response = await doFetch();
      assertSessionActive();
    }
    if (!response.ok) throw await readError(response);
    const blob = await response.blob();
    assertSessionActive();
    return blob;
  }
}

export const api = new ApiClient();
