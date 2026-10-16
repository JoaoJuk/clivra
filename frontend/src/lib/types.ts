export type IsoDateTime = string;
export type IsoMonth = string;
export type Currency = 'BRL';

export interface User {
  id: string;
  email: string;
  name: string;
  // Contrato 1.0.4: só o admin vê o painel admin.
  role?: 'admin' | 'member';
  createdAt?: IsoDateTime;
}

// Painel admin (contrato §17): só dados de conta, nunca gastos de outra pessoa.
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  createdAt: IsoDateTime;
  lastLoginAt: IsoDateTime | null;
  disabledAt: IsoDateTime | null;
  activeSessions: number;
}

export interface AdminInvite {
  id: string;
  email: string;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
}

export interface SystemStatus {
  environment: 'production' | 'staging' | 'development';
  release: string;
  startedAt: IsoDateTime;
  database: 'ok' | 'error';
  lastBackupAt: IsoDateTime | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: User;
}

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId: string;
  };
}

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
  total?: number | null;
}

export interface Page<T> {
  data: T[];
  page: PageInfo;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  group: 'essencial' | 'fixo' | 'variavel' | 'financeiro';
}

export interface Card {
  id: string;
  name: string;
  bank: 'nubank' | 'itau' | 'other' | (string & {});
  brand: 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'other' | (string & {});
  lastFourDigits?: string | null;
  type: 'credit' | 'debit';
  color: string;
  closingDay?: number | null;
  dueDay?: number | null;
  limitCents?: number | null;
  archived: boolean;
  createdAt: IsoDateTime;
}

export interface CreateCardInput {
  name: string;
  bank: string;
  brand?: string;
  lastFourDigits?: string | null;
  type?: 'credit' | 'debit';
  color?: string;
  closingDay?: number | null;
  dueDay?: number | null;
  limitCents?: number | null;
}

export interface Installment {
  number: number;
  total: number;
  groupId: string;
  totalAmountCents: number;
}

export type TransactionStatus = 'pending_category' | 'categorized' | 'ignored' | 'refunded';

export interface Transaction {
  id: string;
  cardId: string;
  amountCents: number;
  currency: Currency;
  merchantRaw: string;
  merchantName?: string | null;
  description?: string | null;
  categoryId?: string | null;
  categorySource: 'learned_rule' | 'dictionary' | 'user' | 'inherited_installment' | 'unknown';
  confidence?: number | null;
  status: TransactionStatus;
  occurredAt: IsoDateTime;
  postedAt?: IsoDateTime | null;
  source: 'manual' | 'share' | 'email' | 'shortcut' | 'openfinance' | 'import' | (string & {});
  installment?: Installment | null;
  refundOfTransactionId?: string | null;
  isRecurring: boolean;
  recurringGroupId?: string | null;
  statementMonth?: IsoMonth | null;
  tags: string[];
  notes?: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateTransactionInput {
  cardId: string;
  amountCents: number;
  merchantRaw: string;
  occurredAt: IsoDateTime;
  categoryId?: string;
  notes?: string;
  installment?: { number: number; total: number };
}

export interface QuestionSuggestion {
  categoryId: string;
  confidence: number;
  reason: 'similar_merchant' | 'frequency' | 'amount_pattern' | 'category_history' | (string & {});
}

export interface Question {
  id: string;
  transactionId: string;
  merchantRaw: string;
  merchantNameGuess?: string | null;
  amountCents: number;
  occurredAt: IsoDateTime;
  cardId: string;
  cardName: string;
  suggestions: QuestionSuggestion[];
  occurrenceCount: number;
  status: 'open' | 'answered' | 'dismissed';
  createdAt: IsoDateTime;
  answeredAt?: IsoDateTime | null;
}

export interface Rule {
  id: string;
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  categoryId: string;
  merchantName?: string | null;
  source: 'user' | 'dictionary';
  hitCount: number;
  lastUsedAt?: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface Summary {
  period: { type: 'month' | 'statement' | 'custom'; from: IsoDateTime; to: IsoDateTime; label: string };
  totals: {
    spentCents: number;
    refundedCents: number;
    netCents: number;
    transactionCount: number;
    pendingCategoryCount: number;
    pendingCategoryCents: number;
    dailyAverageCents: number;
    projectedMonthCents?: number | null;
  };
  comparison?: { previousNetCents: number; deltaCents: number; deltaPercent: number } | null;
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    icon: string;
    color: string;
    amountCents: number;
    transactionCount: number;
    percent: number;
    previousAmountCents?: number | null;
    deltaPercent?: number | null;
  }>;
  byCard: Array<{ cardId: string; name: string; color: string; amountCents: number; transactionCount: number; percent: number }>;
  byGroup: Array<{ group: string; amountCents: number; percent: number }>;
  timeline: Array<{ date: string; amountCents: number; transactionCount: number }>;
}

export interface MonthSummary {
  month: IsoMonth;
  label: string;
  netCents: number;
  transactionCount: number;
}

export interface Insight {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
  categoryId?: string | null;
  amountCents?: number | null;
  deltaPercent?: number | null;
  transactionIds: string[];
}

export interface Budget {
  id: string;
  categoryId: string | null;
  amountCents: number;
  period: 'monthly';
  alertThresholdPercent: number;
  active: boolean;
  createdAt: IsoDateTime;
}

export interface BudgetWithProgress {
  budget: Budget;
  progress: {
    spentCents: number;
    remainingCents: number;
    percent: number;
    status: 'ok' | 'warning' | 'exceeded';
    projectedCents: number;
    daysLeft: number;
  };
}

export interface Subscription {
  id: string;
  merchantName: string;
  merchantRaw: string;
  categoryId: string;
  amountCents: number;
  intervalDays: number;
  occurrenceCount: number;
  firstSeenAt: IsoDateTime;
  lastChargedAt: IsoDateTime;
  nextExpectedAt: IsoDateTime;
  status: 'active' | 'paused' | 'cancelled';
  priceHistory: Array<{ amountCents: number; since: IsoDateTime }>;
  confirmed: boolean;
}

export interface ForecastMonth {
  month: IsoMonth;
  label: string;
  committedCents: number;
  installmentCount: number;
  subscriptionsCents: number;
  totalCents: number;
}

export interface IngestRawInput {
  source: 'share' | 'paste' | 'email' | 'shortcut' | 'manual';
  text: string;
  cardIdHint?: string;
  receivedAt?: IsoDateTime;
}

export type IngestRawResponse =
  | { status: 'parsed'; transaction: Transaction; question?: Question | null; parser: { bank: string; confidence: number } }
  | { status: 'unparsed'; reason: string; extracted: { amountCents?: number | null; merchantRaw?: string | null; occurredAt?: IsoDateTime | null }; ingestId: string };
