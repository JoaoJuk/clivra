import type {
  Card,
  Category,
  CreateCardInput,
  CreateTransactionInput,
  Insight,
  Question,
  Summary,
  Transaction,
  User,
  IngestRawResponse,
} from "../lib/types";

export type ViewName = "dashboard" | "transactions" | "questions" | "cards" | "settings";
export interface TransactionFilters { search?: string; cardId?: string; status?: string }
export interface ImportStatementSummary {
  imported: number;
  duplicatesSkipped: number;
  pendingCategory: number;
  errors: Array<{ line: number; reason: string }>;
}

export interface AppViewData {
  user?: User | null;
  summary?: Summary | null;
  transactions?: Transaction[];
  questions?: Question[];
  cards?: Card[];
  categories?: Category[];
  insights?: Insight[];
  pendingQuestionCount?: number;
  offline?: boolean;
  loading?: boolean;
  error?: string | null;
  hasMoreTransactions?: boolean;
  transactionFilters?: TransactionFilters;
  transactionSummary?: { totalCents: number; count: number };
  hasMoreQuestions?: boolean;
  pushEnabled?: boolean;
}

export interface AppViewActions {
  onAnswerQuestion?: (questionId: string, categoryId: string) => Promise<void> | void;
  onCreateCard?: (input: CreateCardInput) => Promise<void> | void;
  onCreateTransaction?: (input: CreateTransactionInput) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  onLoadMoreTransactions?: () => Promise<void> | void;
  onTransactionFiltersChange?: (filters: TransactionFilters) => void;
  onLoadMoreQuestions?: () => Promise<void> | void;
  onIngestRaw?: (text: string) => Promise<IngestRawResponse | void> | IngestRawResponse | void;
  onEnablePush?: () => Promise<void> | void;
  onDisablePush?: () => Promise<void> | void;
  onTestPush?: () => Promise<void> | void;
  onExport?: (format: "csv" | "json") => Promise<void> | void;
  onImportStatement?: (file: File, cardId: string) => Promise<ImportStatementSummary>;
}

export interface AppViewProps {
  data?: AppViewData;
  actions?: AppViewActions;
  initialView?: ViewName;
  focusQuestionId?: string;
  initialPasteText?: string;
}
