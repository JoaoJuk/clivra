import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Card, Category, Transaction } from "../lib/types";
import type { AppViewActions, AppViewData, ViewName } from "./types";
import { EmptyState, SurfaceHeader, TransactionRow } from "./Common";
import { formatMoney, formatPercent } from "./format";
import { Icon } from "./Icon";

interface DashboardPageProps {
  data?: AppViewData;
  actions?: AppViewActions;
  onNavigate: (view: ViewName) => void;
  onPaste: () => void;
}

function getCategory(id: string | null | undefined, categories: Category[]) {
  return categories.find((category) => category.id === id);
}

function getCard(id: string, cards: Card[]) {
  return cards.find((card) => card.id === id);
}

export function DashboardPage({ data, actions, onNavigate, onPaste }: DashboardPageProps) {
  const summary = data?.summary;
  const cards = data?.cards ?? [];
  const categories = data?.categories ?? [];
  const recent = (data?.transactions ?? []).slice(0, 5);
  const pendingCount = data?.pendingQuestionCount ?? data?.questions?.length ?? 0;
  const categoryRows = summary?.byCategory?.filter((row) => row.amountCents > 0).slice(0, 5) ?? [];
  const change = summary?.comparison?.deltaPercent;
  const chartData = summary?.timeline ?? [];

  return <div className="page dashboard-page">
    <div className="page-heading"><div><p className="eyebrow">BEM-VINDO DE VOLTA</p><h1>Seu dinheiro, <em>mais claro.</em></h1><p>Acompanhe seus gastos e veja o que merece atenção.</p></div><button type="button" className="button button-outline page-heading-action" onClick={onPaste} disabled={!actions?.onIngestRaw || data?.offline}><Icon name="plus" size={18} /> Adicionar pelo texto</button></div>

    {!summary ? <section className="surface intro-surface"><EmptyState icon={data?.loading ? "refresh" : "spark"} title={data?.loading ? "Carregando seu resumo" : "Tudo pronto para começar"} description={data?.loading ? "Buscando seus cartões e compras..." : cards.length ? "Assim que suas compras aparecerem, você verá aqui o resumo do mês." : "Adicione seu primeiro cartão para acompanhar seus gastos em um só lugar."} action={!data?.loading && <button type="button" className="button button-primary" onClick={() => onNavigate(cards.length ? "transactions" : "cards")}>{cards.length ? "Ver gastos" : "Adicionar cartão"}<Icon name="arrowRight" size={17} /></button>} /></section> : <>
      <div className="dashboard-top-grid"><section className="summary-hero" aria-label="Resumo do período"><div className="summary-hero-art" aria-hidden="true" /><div className="summary-hero-top"><span className="hero-period"><Icon name="calendar" size={16} />{summary?.period?.label || "Mês atual"}</span><span className="hero-label">GASTO LÍQUIDO</span></div><div className="summary-hero-main"><p>Seu total no período</p><strong>{formatMoney(summary?.totals?.netCents ?? 0)}</strong></div><div className="summary-hero-footer"><span>{change == null ? "Sem comparação anterior" : <><Icon name={change > 0 ? "arrowUpRight" : "arrowDownRight"} size={16} /> {formatPercent(Math.abs(change))} {change > 0 ? "a mais" : "a menos"} que antes</>}</span><span>{summary?.totals?.transactionCount ?? 0} compras</span></div></section>

      <section className="surface overview-panel"><SurfaceHeader eyebrow="NO SEU RADAR" title="Visão rápida" /><div className="overview-stats"><div><span className="overview-icon mint"><Icon name="wallet" size={20} /></span><span>Média por dia</span><strong>{formatMoney(summary?.totals?.dailyAverageCents ?? 0)}</strong></div><div><span className="overview-icon peach"><Icon name="help" size={20} /></span><span>Sem categoria</span><strong>{summary?.totals?.pendingCategoryCount ?? 0} compras</strong></div></div>{pendingCount > 0 && <button type="button" className="attention-link" onClick={() => onNavigate("questions")}><span className="attention-icon"><Icon name="spark" size={19} /></span><span><strong>Tem {pendingCount} {pendingCount === 1 ? "compra esperando" : "compras esperando"} você</strong><small>Um toque ajuda a organizar tudo.</small></span><Icon name="arrowRight" size={18} /></button>}</section></div>

      <div className="dashboard-chart-grid"><section className="surface chart-panel"><SurfaceHeader eyebrow="RITMO DO MÊS" title="Gastos ao longo dos dias" />{chartData.length ? <div className="chart-wrap" role="img" aria-label="Gráfico dos gastos diários do período"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 6, left: 7, bottom: 0 }}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4caa8d" stopOpacity={0.29} /><stop offset="100%" stopColor="#4caa8d" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e8eeea" strokeDasharray="3 5" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#84938b", fontSize: 11 }} tickFormatter={(value: string) => value.slice(8)} minTickGap={18} /><YAxis width={82} axisLine={false} tickLine={false} tick={{ fill: "#84938b", fontSize: 10 }} tickFormatter={(value: number) => formatMoney(value)} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7ede8", boxShadow: "0 12px 30px #18372c1c" }} formatter={(value) => formatMoney(Number(value ?? 0))} labelFormatter={(value) => `Dia ${String(value).slice(8, 10)}`} /><Area type="monotone" dataKey="amountCents" name="Gastos" stroke="#248466" strokeWidth={2.5} fill="url(#spendFill)" dot={false} activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer></div> : <EmptyState icon="list" title="Sem movimento por aqui" description="Os gastos do período aparecerão neste gráfico." />}</section>

      <section className="surface categories-panel"><SurfaceHeader eyebrow="ONDE FOI" title="Por categoria" action={<button type="button" className="text-button" onClick={() => onNavigate("transactions")}>Ver tudo <Icon name="arrowRight" size={15} /></button>} />{categoryRows.length ? <div className="category-breakdown">{categoryRows.map((row) => <div className="category-breakdown-row" key={row.categoryId ?? "uncategorized"}><div className="category-breakdown-label"><span className="category-dot" style={{ backgroundColor: row.color }} /><span>{row.name}</span><strong>{formatMoney(row.amountCents)}</strong></div><div className="progress-track"><span style={{ width: `${Math.min(Math.max(row.percent, 0), 100)}%`, backgroundColor: row.color }} /></div></div>)}</div> : <EmptyState icon="wallet" title="Sem categorias ainda" description="Quando houver compras, a divisão dos gastos aparece aqui." />}</section></div>
    </>}

    <div className="dashboard-bottom-grid"><section className="surface recent-panel"><SurfaceHeader eyebrow="ATIVIDADE RECENTE" title="Últimas compras" action={<button type="button" className="text-button" onClick={() => onNavigate("transactions")}>Ver todas <Icon name="arrowRight" size={15} /></button>} />{recent.length ? <div className="transaction-list">{recent.map((transaction: Transaction) => <TransactionRow key={transaction.id} transaction={transaction} card={getCard(transaction.cardId, cards)} category={getCategory(transaction.categoryId, categories)} />)}</div> : <EmptyState icon="list" title="Nenhuma compra registrada" description="Adicione uma compra manualmente ou cole o texto recebido do banco." action={<button type="button" className="button button-subtle" onClick={() => onNavigate("transactions")}>Adicionar compra</button>} />}</section><section className="surface cards-preview"><SurfaceHeader eyebrow="EM UM SÓ LUGAR" title="Seus cartões" action={<button type="button" className="text-button" onClick={() => onNavigate("cards")}>Ver cartões <Icon name="arrowRight" size={15} /></button>} />{cards.length ? <div className="card-mini-list">{cards.filter((card) => !card.archived).slice(0, 3).map((card) => <div className="card-mini-row" key={card.id}><span className="card-mini-icon" style={{ backgroundColor: card.color || "#204b40" }}><Icon name="card" size={18} /></span><span><strong>{card.name}</strong><small>{card.lastFourDigits ? `•••• ${card.lastFourDigits}` : card.type === "debit" ? "Débito" : "Crédito"}</small></span><Icon name="arrowRight" size={16} /></div>)}</div> : <EmptyState icon="card" title="Nenhum cartão ainda" description="Cadastre seus cartões para começar." action={<button type="button" className="button button-subtle" onClick={() => onNavigate("cards")}>Adicionar cartão</button>} />}</section></div>
    {Boolean(data?.insights?.length) && <section className="surface insights-panel"><SurfaceHeader eyebrow="PARA FICAR DE OLHO" title="Alertas do mês" /><div className="insights-list">{data?.insights?.slice(0, 3).map((insight) => <article className={`insight-item insight-${insight.severity}`} key={insight.id}><span className="insight-icon"><Icon name="spark" size={18} /></span><div><strong>{insight.title}</strong><p>{insight.description}</p></div></article>)}</div></section>}
  </div>;
}

