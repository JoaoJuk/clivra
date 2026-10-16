import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import type { AppViewProps, ViewName } from "./types";
import { Icon, type IconName } from "./Icon";
import { StatusPill } from "./Common";
import { ManualTransactionDialog, TransactionsPage, type ManualTransactionPrefill } from "./TransactionsPage";
import { QuestionsPage } from "./QuestionsPage";
import { CardsPage } from "./CardsPage";
import { SettingsPage } from "./SettingsPage";
import "./styles.css";

const DashboardPage = lazy(() => import("./DashboardPage").then((module) => ({ default: module.DashboardPage })));

export type { AppViewProps, AppViewActions, AppViewData, ViewName } from "./types";

const navigation: { id: ViewName; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Início", icon: "home" },
  { id: "transactions", label: "Gastos", icon: "list" },
  { id: "questions", label: "Pendências", icon: "help" },
  { id: "cards", label: "Cartões", icon: "card" },
  { id: "settings", label: "Ajustes", icon: "settings" },
];

const pageTitles: Record<ViewName, string> = {
  dashboard: "Visão geral",
  transactions: "Seus gastos",
  questions: "Pendências",
  cards: "Seus cartões",
  settings: "Ajustes",
};

function Navigation({ activeView, onNavigate, pendingCount }: { activeView: ViewName; onNavigate: (view: ViewName) => void; pendingCount: number }) {
  return <nav className="app-navigation" aria-label="Navegação principal">{navigation.map((item) => <button key={item.id} type="button" className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`} aria-current={activeView === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
    <span className="nav-icon"><Icon name={item.icon} size={21} />{item.id === "questions" && pendingCount > 0 && <span className="nav-count">{pendingCount > 99 ? "99+" : pendingCount}</span>}</span>
    <span>{item.label}</span>
  </button>)}</nav>;
}

export function AppView({ data, actions, initialView = "dashboard", focusQuestionId, initialPasteText }: AppViewProps) {
  const [activeView, setActiveView] = useState<ViewName>(initialView);
  const [pasteOpen, setPasteOpen] = useState(Boolean(initialPasteText));
  const [pasteText, setPasteText] = useState(initialPasteText ?? "");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [manualPrefill, setManualPrefill] = useState<ManualTransactionPrefill | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingCount = data?.pendingQuestionCount ?? data?.questions?.length ?? 0;

  useEffect(() => { setActiveView(initialView); }, [initialView]);
  useEffect(() => { if (focusQuestionId) setActiveView("questions"); }, [focusQuestionId]);
  useEffect(() => {
    if (initialPasteText) { setPasteText(initialPasteText); setPasteOpen(true); }
  }, [initialPasteText]);

  async function refresh() {
    if (!actions?.onRefresh || refreshBusy) return;
    setRefreshBusy(true);
    try { await actions.onRefresh(); setNotice("Dados atualizados."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar agora."); }
    finally { setRefreshBusy(false); }
  }

  async function submitPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actions?.onIngestRaw || pasteBusy) return;
    const text = pasteText.trim();
    if (!text) { setPasteError("Cole o texto da compra para continuar."); return; }
    if (text.length > 8000) { setPasteError("O texto pode ter até 8.000 caracteres."); return; }
    setPasteBusy(true); setPasteError(null);
    try {
      const result = await actions.onIngestRaw(text);
      if (result && result.status === "unparsed") {
        if (!actions.onCreateTransaction) { setPasteError("Não conseguimos identificar a compra. Use o lançamento manual para completar os dados."); return; }
        if (!(data?.cards ?? []).some((card) => !card.archived)) { setPasteError("Cadastre um cartão antes de completar esta compra."); return; }
        setPasteOpen(false); setPasteText(""); setManualPrefill(result.extracted);
        setActiveView("transactions");
      } else {
        setPasteOpen(false); setPasteText(""); setNotice("Compra adicionada com sucesso.");
        setActiveView("transactions");
      }
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : "Não foi possível enviar a compra.");
    } finally { setPasteBusy(false); }
  }

  const common = { data, actions, onNavigate: setActiveView, onPaste: () => { setPasteError(null); setPasteOpen(true); }, setNotice };
  return <div className="app-layout">
    <aside className="app-sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="wallet" size={22} /></span><span><strong>cartão</strong><small>seu dinheiro, claro</small></span></div>
      <div className="sidebar-group-label">MENU</div>
      <Navigation activeView={activeView} onNavigate={setActiveView} pendingCount={pendingCount} />
      <div className="sidebar-bottom"><div className="privacy-note"><Icon name="shield" size={18} /><span>Seus dados, sob seu controle.</span></div><StatusPill offline={data?.offline} loading={data?.loading || refreshBusy} /></div>
    </aside>

    <div className="app-content-shell">
      <header className="app-topbar">
        <div className="mobile-brand"><span className="brand-mark"><Icon name="wallet" size={19} /></span><strong>cartão</strong></div>
        <div className="topbar-heading"><span className="topbar-kicker">CONTROLE FINANCEIRO</span><strong>{pageTitles[activeView]}</strong></div>
        <div className="topbar-actions"><span className="topbar-status"><StatusPill offline={data?.offline} loading={data?.loading || refreshBusy} /></span><button type="button" className="icon-button" onClick={refresh} disabled={!actions?.onRefresh || refreshBusy} aria-label="Atualizar dados"><Icon name="refresh" size={18} /></button><span className="user-avatar" aria-label={data?.user?.name || "Usuário"}>{data?.user?.name?.trim().charAt(0).toUpperCase() || "C"}</span></div>
      </header>

      <main className="app-main" id="main-content">
        {data?.offline && <div className="offline-banner" role="status"><Icon name="wifiOff" size={18} /> Você está offline. Exibindo os últimos dados salvos.</div>}
        {data?.error && <div className="error-banner" role="alert"><span>{data.error}</span><button type="button" onClick={refresh} disabled={!actions?.onRefresh || refreshBusy}>Tentar novamente</button></div>}
        {notice && <div className="notice-banner" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso"><Icon name="close" size={16} /></button></div>}
        {activeView === "dashboard" && <Suspense fallback={<section className="surface page-loading" role="status"><Icon name="refresh" size={21} /> Carregando visão geral...</section>}><DashboardPage {...common} /></Suspense>}
        {activeView === "transactions" && <TransactionsPage {...common} />}
        {activeView === "questions" && <QuestionsPage {...common} focusQuestionId={focusQuestionId} />}
        {activeView === "cards" && <CardsPage {...common} />}
        {activeView === "settings" && <SettingsPage {...common} />}
      </main>
    </div>

    <div className="app-bottom-nav"><Navigation activeView={activeView} onNavigate={setActiveView} pendingCount={pendingCount} /></div>

    {pasteOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasteOpen(false); }}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="paste-title">
      <div className="dialog-header"><span className="dialog-icon"><Icon name="spark" size={22} /></span><button type="button" className="icon-button" onClick={() => setPasteOpen(false)} aria-label="Fechar"><Icon name="close" /></button></div>
      <h2 id="paste-title">Adicionar pelo texto</h2><p>Cole a mensagem da compra. Vamos identificar valor e estabelecimento para você.</p>
      <form onSubmit={submitPaste}><label htmlFor="purchase-text" className="field-label">Texto da compra</label><textarea id="purchase-text" className="field-input paste-textarea" value={pasteText} onChange={(event) => setPasteText(event.target.value)} maxLength={8000} placeholder="Ex.: Compra aprovada de R$ 45,90 em Padaria JL..." autoFocus required />{pasteError && <p className="form-error" role="alert">{pasteError}</p>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setPasteOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={!actions?.onIngestRaw || pasteBusy || data?.offline}>{pasteBusy ? "Enviando..." : "Adicionar compra"}</button></div></form>
    </section></div>}
    {manualPrefill && actions?.onCreateTransaction && <ManualTransactionDialog cards={data?.cards ?? []} categories={data?.categories ?? []} prefill={manualPrefill} onClose={() => setManualPrefill(null)} onSubmit={async (input) => { await actions.onCreateTransaction?.(input); setNotice("Compra adicionada com sucesso."); }} />}
  </div>;
}

export default AppView;
