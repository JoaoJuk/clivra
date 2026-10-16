import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './lib/api';
import { disablePush, enablePush, getPushSubscription } from './lib/push';
import { takePendingPushAction } from './lib/pushAction';
import { takeSharedText } from './lib/share';
import { queryPersister } from './lib/query';
import type { CreateCardInput, CreateTransactionInput } from './lib/types';
import { logoutStorageKey, userStorageKey, readOfflineSession, type SessionUser } from './lib/sessionStorage';
import { prunePendingData } from './lib/pendingStore';
import { AppView } from './ui/AppView';
import { AuthView } from './ui/AuthView';
import type { AppViewActions, TransactionFilters as ViewTransactionFilters, ViewName } from './ui/types';

function currentMonthInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir a solicitação.';
}

export function App() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [offlineSession, setOfflineSession] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(navigator.onLine);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharedText, setSharedText] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushCheckVersion, setPushCheckVersion] = useState(0);
  const [requestedView, setRequestedView] = useState<ViewName | null>(null);
  const [requestedQuestionId, setRequestedQuestionId] = useState<string | null>(null);
  const [transactionFilters, setTransactionFilters] = useState<ViewTransactionFilters>({});
  const pushActionInFlight = useRef(false);
  const pushActionReadStarted = useRef(false);
  const shareReadStarted = useRef(false);
  const month = currentMonthInSaoPaulo();
  const authenticated = ready && Boolean(user) && !offlineSession;

  const clearLocalData = useCallback(() => {
    setUser(null);
    setOfflineSession(false);
    setSharedText(null);
    setPushEnabled(false);
    setRequestedView(null);
    setRequestedQuestionId(null);
    setTransactionFilters({});
    shareReadStarted.current = false;
    pushActionReadStarted.current = false;
    queryClient.clear();
    void queryPersisterRemove();
    void prunePendingData(true).catch(() => undefined);
  }, [queryClient]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === logoutStorageKey || (event.key === userStorageKey && event.newValue === null) || event.key === null) api.clearSession();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('clivra:session-ended', clearLocalData);
    void prunePendingData().catch(() => undefined);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('clivra:session-ended', clearLocalData);
    };
  }, [clearLocalData]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const session = await api.refresh();
        if (active) { setUser(session.user); setOfflineSession(false); }
      } catch (error) {
        if (active) {
          const cached = readOfflineSession();
          if (!(error instanceof ApiError) && (!navigator.onLine || error instanceof TypeError) && cached) {
            setUser(cached.user); setOfflineSession(true);
          } else {
            clearLocalData();
            if (!(error instanceof ApiError && error.status === 401)) setActionError('Não foi possível verificar sua sessão. Tente entrar novamente quando a conexão voltar.');
          }
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => { active = false; };
  }, [clearLocalData]);

  useEffect(() => {
    if (!user) return;
    const expiresAt = readOfflineSession()?.expiresAt;
    if (!expiresAt) return;
    const checkExpiry = () => {
      if (Date.now() >= expiresAt) api.clearSession();
    };
    const timer = window.setTimeout(checkExpiry, Math.max(0, expiresAt - Date.now()));
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [user, offlineSession]);

  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true);
      if (offlineSession) {
        void api.refresh().then((session) => {
          setUser(session.user);
          setOfflineSession(false);
          void queryClient.invalidateQueries();
        }).catch((error: unknown) => {
          if (error instanceof ApiError) clearLocalData();
          setActionError('Não foi possível verificar sua sessão. Tente novamente.');
        });
      }
    };
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [offlineSession, queryClient, clearLocalData]);

  useEffect(() => {
    if (!authenticated) return;
    void getPushSubscription().then((subscription) => setPushEnabled(Boolean(subscription))).catch(() => setPushEnabled(false));
  }, [authenticated]);

  useEffect(() => {
    const checkAgain = () => {
      pushActionReadStarted.current = false;
      setPushCheckVersion((version) => version + 1);
    };
    window.addEventListener('focus', checkAgain);
    return () => window.removeEventListener('focus', checkAgain);
  }, []);

  useEffect(() => {
    if (!authenticated || window.location.pathname !== '/share' || shareReadStarted.current) return;
    shareReadStarted.current = true;
    const version = api.sessionVersion;
    void takeSharedText().then((text) => {
      if (version !== api.sessionVersion) return;
      if (text) setSharedText(text);
      else setActionError('Não encontramos o texto compartilhado. Você pode colá-lo manualmente.');
    }).catch(() => setActionError('Não foi possível abrir o conteúdo compartilhado.'));
  }, [authenticated]);

  const healthQuery = useQuery({
    queryKey: ['health'], queryFn: () => api.health(),
    refetchInterval: 30_000, retry: false, staleTime: 10_000,
  });
  const offline = !browserOnline || offlineSession || healthQuery.isError;

  const categoriesQuery = useQuery({
    queryKey: ['categories'], queryFn: () => api.categories(), enabled: authenticated,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const cardsQuery = useQuery({ queryKey: ['cards'], queryFn: () => api.cards(), enabled: authenticated });
  const summaryQuery = useQuery({
    queryKey: ['summary', month], queryFn: () => api.summary({ period: 'month', month }), enabled: authenticated,
  });
  const insightsQuery = useQuery({
    queryKey: ['insights', month], queryFn: () => api.insights(month), enabled: authenticated,
  });
  const countQuery = useQuery({ queryKey: ['questionCount'], queryFn: () => api.questionCount(), enabled: authenticated });
  const transactionsQuery = useInfiniteQuery({
    queryKey: ['transactions', transactionFilters],
    queryFn: ({ pageParam }) => api.transactions({ ...transactionFilters, limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.hasMore ? lastPage.page.nextCursor || undefined : undefined,
    enabled: authenticated,
  });
  const questionsQuery = useInfiniteQuery({
    queryKey: ['questions'],
    queryFn: ({ pageParam }) => api.questions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.hasMore ? lastPage.page.nextCursor || undefined : undefined,
    enabled: authenticated,
  });

  const transactions = useMemo(() => transactionsQuery.data?.pages.flatMap((page) => page.data) || [], [transactionsQuery.data]);
  const questions = useMemo(() => questionsQuery.data?.pages.flatMap((page) => page.data) || [], [questionsQuery.data]);

  useEffect(() => {
    const errors = [categoriesQuery.error, cardsQuery.error, summaryQuery.error, transactionsQuery.error, questionsQuery.error];
    if (errors.some((error) => error instanceof ApiError && error.code === 'INVALID_REFRESH_TOKEN')) {
      setUser(null);
      queryClient.clear();
      void queryPersisterRemove();
    }
  }, [categoriesQuery.error, cardsQuery.error, summaryQuery.error, transactionsQuery.error, questionsQuery.error, queryClient]);

  const invalidateFinancialData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['questions'] }),
      queryClient.invalidateQueries({ queryKey: ['questionCount'] }),
      queryClient.invalidateQueries({ queryKey: ['summary'] }),
      queryClient.invalidateQueries({ queryKey: ['insights'] }),
    ]);
  }, [queryClient]);

  const answerQuestion = useCallback(async (questionId: string, categoryId: string) => {
    setActionError(null);
    try {
      const result = await api.answerQuestion(questionId, categoryId);
      queryClient.setQueryData(['questionCount'], { open: result.remainingOpenQuestions });
      await invalidateFinancialData();
    } catch (error) {
      setActionError(errorMessage(error));
      throw error;
    }
  }, [invalidateFinancialData, queryClient]);

  const changeTransactionFilters = useCallback((filters: ViewTransactionFilters) => {
    setTransactionFilters({ search: filters.search || undefined, cardId: filters.cardId || undefined, status: filters.status || undefined });
  }, []);

  useEffect(() => {
    if (!authenticated || offline || pushActionReadStarted.current || pushActionInFlight.current) return;
    pushActionReadStarted.current = true;
    void takePendingPushAction().then(async (pending) => {
      if (!pending) return;
      pushActionInFlight.current = true;
      try { await answerQuestion(pending.questionId, pending.categoryId); }
      finally { pushActionInFlight.current = false; }
    }).catch((error) => setActionError(errorMessage(error)));
  }, [authenticated, offline, answerQuestion, pushCheckVersion]);

  const actions: AppViewActions = {
    onAnswerQuestion: answerQuestion,
    onCreateCard: async (input: CreateCardInput) => {
      setActionError(null);
      try {
        await api.createCard(input);
        await queryClient.invalidateQueries({ queryKey: ['cards'] });
      } catch (error) { setActionError(errorMessage(error)); throw error; }
    },
    onCreateTransaction: async (input: CreateTransactionInput) => {
      setActionError(null);
      try {
        const result = await api.createTransaction(input);
        await invalidateFinancialData();
        if (result.question) {
          setRequestedQuestionId(result.question.id);
          setRequestedView('questions');
        }
      } catch (error) { setActionError(errorMessage(error)); throw error; }
    },
    onRefresh: async () => {
      setActionError(null);
      if (offlineSession) {
        const session = await api.refresh();
        setUser(session.user);
        setOfflineSession(false);
      }
      await queryClient.invalidateQueries();
    },
    onLogout: async () => {
      setActionError(null);
      try {
        await disablePush();
        setPushEnabled(false);
        await prunePendingData(true);
        await api.logout();
        clearLocalData();
      } catch {
        setActionError('Não foi possível concluir a saída. Sua sessão continua aberta. Verifique a conexão e tente novamente.');
        throw new Error('Não foi possível sair. Verifique a conexão e tente novamente.');
      }
    },
    onLoadMoreTransactions: async () => { if (transactionsQuery.hasNextPage) await transactionsQuery.fetchNextPage(); },
    onTransactionFiltersChange: changeTransactionFilters,
    onLoadMoreQuestions: async () => { if (questionsQuery.hasNextPage) await questionsQuery.fetchNextPage(); },
    onIngestRaw: async (text: string) => {
      setActionError(null);
      const result = await api.ingestRaw({ source: sharedText ? 'share' : 'paste', text });
      setSharedText(null);
      if (window.location.pathname === '/share') window.history.replaceState({}, '', '/');
      if (result.status === 'parsed') await invalidateFinancialData();
      return result;
    },
    onImportStatement: async (file: File, cardId: string) => {
      const result = await api.ingestStatement(file, cardId);
      await invalidateFinancialData();
      return result;
    },
    onEnablePush: async () => { await enablePush(); setPushEnabled(true); },
    onDisablePush: async () => { await disablePush(); setPushEnabled(false); },
    onTestPush: async () => { await api.testPush(); },
    onExport: async (format: 'csv' | 'json') => {
      const blob = await api.exportTransactions({ format });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cartao-transacoes-${month}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };

  async function handleAuth(mode: 'login' | 'register', input: { email: string; password: string; name?: string; setupCode?: string; emailCode?: string }) {
    setActionError(null);
    const session = mode === 'register'
      ? await api.register({ email: input.email, password: input.password, name: input.name || '', emailCode: input.emailCode || '', ...(input.setupCode ? { setupCode: input.setupCode } : {}) })
      : await api.login({ email: input.email, password: input.password });
    queryClient.clear();
    await queryPersisterRemove();
    setUser(session.user);
    setOfflineSession(false);
  }

  if (!ready) return <div className="boot-screen" role="status">Abrindo seu controle de gastos...</div>;
  if (!user) return <AuthView
    onSubmit={handleAuth}
    onRequestCode={(input) => api.emailCode(input)}
    onResetPassword={(input) => api.resetPassword(input)}
    loading={false}
    error={actionError}
  />;

  const path = window.location.pathname;
  const initialView: ViewName = requestedView || (path.startsWith('/questions') ? 'questions' : 'dashboard');
  const focusQuestionId = requestedQuestionId || path.match(/^\/questions\/([^/]+)\/?$/)?.[1];
  const queryError = [summaryQuery.error, transactionsQuery.error, questionsQuery.error, cardsQuery.error, categoriesQuery.error]
    .find((error) => error && !(offline && !(error instanceof ApiError)));

  return <AppView
    initialView={initialView}
    focusQuestionId={focusQuestionId}
    initialPasteText={sharedText || undefined}
    data={{
      user,
      summary: summaryQuery.data || null,
      transactions,
      questions,
      cards: cardsQuery.data?.data || [],
      categories: categoriesQuery.data?.data || [],
      insights: insightsQuery.data?.data || [],
      pendingQuestionCount: countQuery.data?.open,
      offline,
      loading: [summaryQuery, transactionsQuery, questionsQuery, cardsQuery, categoriesQuery].some((query) => query.isPending),
      error: actionError || (queryError ? errorMessage(queryError) : null),
      hasMoreTransactions: Boolean(transactionsQuery.hasNextPage),
      transactionFilters,
      transactionSummary: transactionsQuery.data?.pages[0]?.summary,
      hasMoreQuestions: Boolean(questionsQuery.hasNextPage),
      pushEnabled,
    }}
    actions={actions}
  />;
}

async function queryPersisterRemove(): Promise<void> {
  await queryPersister.removeClient();
}
