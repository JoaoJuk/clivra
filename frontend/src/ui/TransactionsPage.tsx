import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Card, Category, CreateTransactionInput, Transaction } from "../lib/types";
import type { AppViewActions, AppViewData, TransactionFilters, ViewName } from "./types";
import { EmptyState, TransactionRow } from "./Common";
import { formatMoney, localDateTimeInputValue, parseMoneyInput, saoPauloDateTimeToUtc } from "./format";
import { Icon } from "./Icon";

interface TransactionsPageProps {
  data?: AppViewData;
  actions?: AppViewActions;
  onNavigate: (view: ViewName) => void;
  onPaste: () => void;
  setNotice: (message: string | null) => void;
}

export interface ManualTransactionPrefill { amountCents?: number | null; merchantRaw?: string | null; occurredAt?: string | null }

export function ManualTransactionDialog({ cards, categories, onClose, onSubmit, prefill }: { cards: Card[]; categories: Category[]; onClose: () => void; onSubmit: (input: CreateTransactionInput) => Promise<void> | void; prefill?: ManualTransactionPrefill }) {
  const [cardId, setCardId] = useState(cards.find((card) => !card.archived)?.id ?? "");
  const [amount, setAmount] = useState(prefill?.amountCents != null ? `${Math.floor(prefill.amountCents / 100)},${String(Math.abs(prefill.amountCents % 100)).padStart(2, "0")}` : "");
  const [merchant, setMerchant] = useState(prefill?.merchantRaw ?? "");
  const [occurredAt, setOccurredAt] = useState(prefill?.occurredAt ? localDateTimeInputValue(new Date(prefill.occurredAt)) : localDateTimeInputValue());
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (!amountCents || amountCents <= 0) { setError("Informe um valor maior que zero. Use vírgula para os centavos."); return; }
    if (!cardId || !merchant.trim() || !occurredAt) { setError("Preencha cartão, estabelecimento e data."); return; }
    setBusy(true); setError(null);
    try {
      const input: CreateTransactionInput = { cardId, amountCents, merchantRaw: merchant.trim(), occurredAt: saoPauloDateTimeToUtc(occurredAt), ...(categoryId ? { categoryId } : {}) };
      await onSubmit(input);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a compra."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="manual-title"><div className="dialog-header"><span className="dialog-icon"><Icon name="edit" size={22} /></span><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><h2 id="manual-title">{prefill ? "Complete a compra" : "Adicionar compra"}</h2><p>{prefill ? "Não conseguimos identificar todos os dados no texto. Confira e complete os campos abaixo." : "Registre uma compra que ainda não apareceu. Se deixar a categoria em branco, o sistema tentará identificá-la."}</p><form onSubmit={submit} className="form-grid">
    <label className="field"><span className="field-label">Valor</span><span className="input-prefix"><span>R$</span><input className="field-input" type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required /></span></label>
    <label className="field"><span className="field-label">Cartão</span><select className="field-input" value={cardId} onChange={(event) => setCardId(event.target.value)} required><option value="">Selecione</option>{cards.filter((card) => !card.archived).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
    <label className="field field-full"><span className="field-label">Estabelecimento</span><input className="field-input" value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Ex.: Padaria do bairro" maxLength={200} required /></label>
    <label className="field"><span className="field-label">Data e hora (São Paulo)</span><input className="field-input" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required /></label>
    <label className="field"><span className="field-label">Categoria <small>(opcional)</small></span><select className="field-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Identificar automaticamente</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
    {error && <p className="form-error field-full" role="alert">{error}</p>}
    <div className="dialog-actions field-full"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar compra"}</button></div>
  </form></section></div>;
}

export function TransactionsPage({ data, actions, onNavigate, onPaste, setNotice }: TransactionsPageProps) {
  const filters = data?.transactionFilters;
  const [search, setSearch] = useState(filters?.search ?? "");
  const [cardFilter, setCardFilter] = useState(filters?.cardId ?? "");
  const [statusFilter, setStatusFilter] = useState(filters?.status ?? "");
  const [manualOpen, setManualOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const transactions = data?.transactions ?? [];
  const cards = data?.cards ?? [];
  const categories = data?.categories ?? [];
  const serverFiltering = Boolean(actions?.onTransactionFiltersChange);
  useEffect(() => { setSearch(filters?.search ?? ""); }, [filters?.search]);
  useEffect(() => { setCardFilter(filters?.cardId ?? ""); }, [filters?.cardId]);
  useEffect(() => { setStatusFilter(filters?.status ?? ""); }, [filters?.status]);
  useEffect(() => {
    if (!actions?.onTransactionFiltersChange || search === (filters?.search ?? "")) return;
    const timer = window.setTimeout(() => actions.onTransactionFiltersChange?.({ ...filters, search: search || undefined }), 320);
    return () => window.clearTimeout(timer);
  }, [actions, search, filters]);
  const filtered = useMemo(() => serverFiltering ? transactions : transactions.filter((transaction) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const matchesText = !term || [transaction.merchantName, transaction.merchantRaw, transaction.notes].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term));
    return matchesText && (!cardFilter || transaction.cardId === cardFilter) && (!statusFilter || transaction.status === statusFilter);
  }), [transactions, search, cardFilter, statusFilter, serverFiltering]);
  const totalCents = serverFiltering && data?.transactionSummary ? data.transactionSummary.totalCents : filtered.filter((transaction) => transaction.status !== "ignored").reduce((total, transaction) => total + transaction.amountCents, 0);
  const count = serverFiltering && data?.transactionSummary ? data.transactionSummary.count : filtered.length;

  function changeFilter(update: Partial<TransactionFilters>) {
    const next = { search: search || undefined, cardId: cardFilter || undefined, status: statusFilter || undefined, ...update };
    actions?.onTransactionFiltersChange?.(next);
  }

  async function loadMore() {
    if (!actions?.onLoadMoreTransactions || loadingMore) return;
    setLoadingMore(true);
    try { await actions.onLoadMoreTransactions(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível carregar mais compras."); }
    finally { setLoadingMore(false); }
  }

  return <div className="page transactions-page"><div className="page-heading"><div><p className="eyebrow">SEU HISTÓRICO</p><h1>Cada compra, <em>no lugar certo.</em></h1><p>Encontre e acompanhe os lançamentos dos seus cartões.</p></div><div className="heading-button-group"><button type="button" className="button button-outline" onClick={onPaste} disabled={!actions?.onIngestRaw || data?.offline}><Icon name="spark" size={18} /> Colar texto</button><button type="button" className="button button-primary" onClick={() => setManualOpen(true)} disabled={!actions?.onCreateTransaction || !cards.some((card) => !card.archived) || data?.offline}><Icon name="plus" size={18} /> Nova compra</button></div></div>
    <section className="surface transactions-surface"><div className="transactions-summary"><div><p className="eyebrow">{serverFiltering ? "RESULTADO DOS FILTROS" : "COMPRAS CARREGADAS"}</p><strong>{formatMoney(totalCents)}</strong><span>{count} {count === 1 ? "lançamento" : "lançamentos"}{!serverFiltering && data?.hasMoreTransactions ? " carregados" : ""}</span></div><span className="transactions-summary-icon"><Icon name="wallet" size={24} /></span></div>
      <div className="transaction-filters"><label className="search-field"><Icon name="search" size={18} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={serverFiltering ? "Buscar compras" : "Buscar nas compras carregadas"} aria-label="Buscar compras" /></label><select aria-label="Filtrar por cartão" value={cardFilter} onChange={(event) => { setCardFilter(event.target.value); changeFilter({ cardId: event.target.value || undefined }); }}><option value="">Todos os cartões</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select><select aria-label="Filtrar por situação" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); changeFilter({ status: event.target.value || undefined }); }}><option value="">Todas as situações</option><option value="pending_category">A classificar</option><option value="categorized">Categorizadas</option><option value="refunded">Estornadas</option><option value="ignored">Desconsideradas</option></select></div>
      {filtered.length ? <div className="transaction-list full-list">{filtered.map((transaction: Transaction) => <TransactionRow key={transaction.id} transaction={transaction} card={cards.find((card) => card.id === transaction.cardId)} category={categories.find((category) => category.id === transaction.categoryId)} />)}</div> : <EmptyState icon={data?.loading ? "refresh" : search || cardFilter || statusFilter ? "search" : "list"} title={data?.loading ? "Carregando compras" : search || cardFilter || statusFilter ? "Nenhuma compra encontrada" : "Seu histórico começa aqui"} description={data?.loading ? "Buscando seu histórico..." : search || cardFilter || statusFilter ? "Tente mudar a busca ou os filtros." : "Adicione seu primeiro cartão e registre uma compra para acompanhar seus gastos."} action={!data?.loading && !search && !cardFilter && !statusFilter && !cards.length ? <button type="button" className="button button-primary" onClick={() => onNavigate("cards")}>Adicionar cartão</button> : undefined} />}
      {data?.hasMoreTransactions && <div className="load-more"><button type="button" className="button button-outline" onClick={loadMore} disabled={!actions?.onLoadMoreTransactions || loadingMore}>{loadingMore ? "Carregando..." : "Carregar mais compras"}</button></div>}
    </section>
    {manualOpen && actions?.onCreateTransaction && <ManualTransactionDialog cards={cards} categories={categories} onClose={() => setManualOpen(false)} onSubmit={async (input) => { await actions.onCreateTransaction?.(input); setNotice("Compra adicionada com sucesso."); }} />}
  </div>;
}
