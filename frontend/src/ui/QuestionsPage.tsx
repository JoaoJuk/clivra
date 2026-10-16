import { useEffect, useState } from "react";
import type { Category, Question } from "../lib/types";
import type { AppViewActions, AppViewData, ViewName } from "./types";
import { EmptyState } from "./Common";
import { formatDate, formatMoney } from "./format";
import { Icon } from "./Icon";

interface QuestionsPageProps {
  data?: AppViewData;
  actions?: AppViewActions;
  onNavigate: (view: ViewName) => void;
  focusQuestionId?: string;
  setNotice: (message: string | null) => void;
}

function QuestionCard({ question, categories, onAnswer, disabled, focused }: { question: Question; categories: Category[]; onAnswer?: AppViewActions["onAnswerQuestion"]; disabled: boolean; focused: boolean }) {
  const [showAll, setShowAll] = useState(question.suggestions.length === 0);
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestions = question.suggestions ?? [];
  const suggestedCategories = suggestions.map((suggestion) => categories.find((category) => category.id === suggestion.categoryId)).filter((category): category is Category => Boolean(category));
  const remainingCategories = categories.filter((category) => !suggestedCategories.some((suggested) => suggested.id === category.id));

  async function answer(categoryId: string) {
    if (!onAnswer || disabled || busyCategory) return;
    setBusyCategory(categoryId); setError(null);
    try { await onAnswer(question.id, categoryId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a categoria."); }
    finally { setBusyCategory(null); }
  }

  return <article className={`question-card${focused ? " question-card-focused" : ""}`} id={`question-${question.id}`}><div className="question-top"><span className="question-icon"><Icon name="help" size={24} /></span><span className="question-card-status">PRECISA DE VOCÊ</span></div><h2>Onde entra <span>{question.merchantNameGuess || question.merchantRaw}</span>?</h2><div className="question-meta"><strong>{formatMoney(question.amountCents)}</strong><span>·</span><span>{question.cardName}</span><span>·</span><span>{formatDate(question.occurredAt)}</span></div>{question.occurrenceCount > 1 && <p className="question-impact"><Icon name="spark" size={17} /> Sua resposta organiza {question.occurrenceCount} compras deste estabelecimento.</p>}
    <div className="question-separator" /><p className="question-choice-label">Escolha uma categoria</p>
    {suggestedCategories.length > 0 && <div className="suggestion-grid">{suggestedCategories.map((category) => <button type="button" className="suggestion-button" key={category.id} disabled={disabled || Boolean(busyCategory)} onClick={() => answer(category.id)}><span className="suggestion-emoji" style={{ backgroundColor: `${category.color}1a` }}>{category.icon}</span><strong>{category.name}</strong><Icon name="arrowRight" size={16} /></button>)}</div>}
    {suggestedCategories.length > 0 && <button type="button" className="all-categories-toggle" onClick={() => setShowAll((open) => !open)} aria-expanded={showAll}>{showAll ? "Ocultar categorias" : "Ver todas as categorias"}<Icon name="chevronDown" size={17} className={showAll ? "rotate-icon" : ""} /></button>}
    {(showAll || suggestedCategories.length === 0) && <div className="all-categories-grid">{remainingCategories.map((category) => <button type="button" key={category.id} className="category-choice" onClick={() => answer(category.id)} disabled={disabled || Boolean(busyCategory)}><span>{category.icon}</span>{category.name}</button>)}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="learn-hint"><Icon name="check" size={15} /> Vamos lembrar dessa escolha para as próximas compras.</p>
  </article>;
}

export function QuestionsPage({ data, actions, onNavigate, focusQuestionId, setNotice }: QuestionsPageProps) {
  const [loadingMore, setLoadingMore] = useState(false);
  const questions = (data?.questions ?? []).filter((question) => question.status === "open");
  const categories = data?.categories ?? [];
  const count = data?.pendingQuestionCount ?? questions.length;

  useEffect(() => {
    if (!focusQuestionId || !questions.some((question) => question.id === focusQuestionId)) return;
    const timer = window.setTimeout(() => document.getElementById(`question-${focusQuestionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => window.clearTimeout(timer);
  }, [focusQuestionId, questions]);

  async function answer(id: string, categoryId: string) {
    if (!actions?.onAnswerQuestion) return;
    await actions.onAnswerQuestion(id, categoryId);
    setNotice("Categoria salva. Vamos lembrar para as próximas compras.");
  }

  async function loadMore() {
    if (!actions?.onLoadMoreQuestions || loadingMore) return;
    setLoadingMore(true);
    try { await actions.onLoadMoreQuestions(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível carregar mais pendências."); }
    finally { setLoadingMore(false); }
  }

  async function refresh() {
    try { await actions?.onRefresh?.(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar as pendências."); }
  }

  return <div className="page questions-page"><div className="page-heading"><div><p className="eyebrow">SUA AJUDA FAZ A DIFERENÇA</p><h1>Uma resposta. <em>Compras organizadas.</em></h1><p>Classifique uma vez e vamos lembrar desse estabelecimento.</p></div><span className="question-count-pill"><Icon name="spark" size={17} />{count} {count === 1 ? "pendência" : "pendências"}</span></div>
    {questions.length ? <div className="questions-layout"><div className="questions-list">{questions.map((question) => <QuestionCard key={question.id} question={question} categories={categories} onAnswer={answer} disabled={Boolean(data?.offline) || !actions?.onAnswerQuestion || !categories.length} focused={question.id === focusQuestionId} />)}{data?.hasMoreQuestions && <div className="load-more"><button type="button" className="button button-outline" onClick={loadMore} disabled={!actions?.onLoadMoreQuestions || loadingMore}>{loadingMore ? "Carregando..." : "Carregar mais pendências"}</button></div>}</div><aside className="questions-aside"><span className="questions-aside-icon"><Icon name="spark" size={22} /></span><h3>Você ensina. O app aprende.</h3><p>Cada categoria escolhida cria uma regra para reconhecer esse estabelecimento da próxima vez.</p><div className="questions-aside-line" /><span><Icon name="shield" size={17} /> Seus dados ficam sob seu controle.</span></aside></div> : <section className="surface questions-empty"><EmptyState icon={data?.loading || count > 0 ? "refresh" : "check"} title={data?.loading ? "Carregando pendências" : count > 0 ? "Pendências indisponíveis" : "Tudo em dia por aqui"} description={data?.loading ? "Buscando suas compras..." : count > 0 ? "Atualize para ver as compras que esperam uma categoria." : "Não há compras esperando uma categoria. Quando surgir alguma dúvida, ela aparecerá aqui."} action={!data?.loading && <button type="button" className="button button-primary" onClick={() => count > 0 ? void refresh() : onNavigate("dashboard")}>{count > 0 ? "Atualizar" : "Voltar ao início"} <Icon name={count > 0 ? "refresh" : "arrowRight"} size={17} /></button>} /></section>}
  </div>;
}

