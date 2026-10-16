import { useState, type FormEvent } from "react";
import type { AppViewActions, AppViewData, ImportStatementSummary, ViewName } from "./types";
import { Icon } from "./Icon";
import { AdminPanel } from "./AdminPanel";

interface SettingsPageProps {
  data?: AppViewData;
  actions?: AppViewActions;
  onNavigate: (view: ViewName) => void;
  onPaste: () => void;
  setNotice: (message: string | null) => void;
}

function ImportStatementDialog({ cards, onClose, onSubmit }: { cards: NonNullable<AppViewData["cards"]>; onClose: () => void; onSubmit: NonNullable<AppViewActions["onImportStatement"]> }) {
  const [cardId, setCardId] = useState(cards.find((card) => !card.archived)?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportStatementSummary | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !cardId) { setError("Escolha um arquivo e o cartão correspondente."); return; }
    if (!/\.(csv|ofx)$/i.test(file.name)) { setError("Use um arquivo CSV ou OFX."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("O arquivo pode ter até 5 MB."); return; }
    setBusy(true); setError(null);
    try { setResult(await onSubmit(file, cardId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar a fatura."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="dialog-header"><span className="dialog-icon"><Icon name="list" size={22} /></span><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><h2 id="import-title">Importar fatura</h2><p>Envie o arquivo CSV ou OFX do banco. Compras já registradas serão ignoradas.</p>
    {result ? <div className="import-result" role="status"><div className="import-result-head"><Icon name="check" size={22} /><strong>Importação concluída</strong></div><div className="import-stats"><span><strong>{result.imported}</strong> importadas</span><span><strong>{result.duplicatesSkipped}</strong> repetidas ignoradas</span><span><strong>{result.pendingCategory}</strong> a classificar</span></div>{result.errors.length > 0 && <div className="import-errors"><strong>Linhas não importadas</strong><ul>{result.errors.slice(0, 10).map((item, index) => <li key={`${item.line}-${index}`}>Linha {item.line}: {item.reason}</li>)}</ul>{result.errors.length > 10 && <small>Mais {result.errors.length - 10} linhas com erro.</small>}</div>}<div className="dialog-actions"><button type="button" className="button button-primary" onClick={onClose}>Concluir</button></div></div> : <form onSubmit={submit} className="form-grid"><label className="field field-full"><span className="field-label">Cartão da fatura</span><select className="field-input" value={cardId} onChange={(event) => setCardId(event.target.value)} required><option value="">Selecione um cartão</option>{cards.filter((card) => !card.archived).map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label><label className="field field-full"><span className="field-label">Arquivo CSV ou OFX (até 5 MB)</span><input className="field-input file-input" type="file" accept=".csv,.ofx,text/csv,application/x-ofx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>{error && <p className="form-error field-full" role="alert">{error}</p>}<div className="dialog-actions field-full"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy || !cards.some((card) => !card.archived)}>{busy ? "Importando..." : "Importar fatura"}</button></div></form>}
  </section></div>;
}

export function SettingsPage({ data, actions, onPaste, setNotice }: SettingsPageProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function run(name: string, action?: () => Promise<void> | void, success?: string) {
    if (!action || busy) return;
    setBusy(name);
    try { await action(); if (success) setNotice(success); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível concluir esta ação."); }
    finally { setBusy(null); }
  }

  return <div className="page settings-page"><div className="page-heading"><div><p className="eyebrow">DO SEU JEITO</p><h1>Seu espaço, <em>suas escolhas.</em></h1><p>Gerencie sua conta, notificações e os dados do app.</p></div></div>
    <div className="settings-grid"><div className="settings-main">{data?.user?.role === "admin" && actions?.admin && <AdminPanel api={actions.admin} currentUserId={data.user.id} offline={data.offline} setNotice={setNotice} />}<section className="surface settings-section"><div className="settings-section-heading"><span className="settings-heading-icon"><Icon name="shield" size={20} /></span><div><h2>Sua conta</h2><p>Informações de acesso</p></div></div><div className="profile-row"><span className="profile-avatar">{data?.user?.name?.trim().charAt(0).toUpperCase() || "C"}</span><div><strong>{data?.user?.name || "Sua conta"}</strong><span>{data?.user?.email || ""}</span></div></div></section>

      <section className="surface settings-section"><div className="settings-section-heading"><span className="settings-heading-icon"><Icon name="bell" size={20} /></span><div><h2>Notificações</h2><p>Saiba quando uma compra precisar de você</p></div></div><div className="settings-action-row"><div><strong>Alertas de categorias</strong><span>{data?.pushEnabled ? "Ativados neste aparelho" : "Receba avisos para classificar compras"}</span></div>{data?.pushEnabled ? <button type="button" className="button button-outline" disabled={!actions?.onDisablePush || data?.offline || busy !== null} onClick={() => run("push", actions?.onDisablePush, "Notificações desativadas.")}>{busy === "push" ? "Aguarde..." : "Desativar"}</button> : <button type="button" className="button button-primary" disabled={!actions?.onEnablePush || data?.offline || busy !== null} onClick={() => run("push", actions?.onEnablePush, "Notificações ativadas.")}>{busy === "push" ? "Aguarde..." : "Ativar"}</button>}</div>{data?.pushEnabled && actions?.onTestPush && <button type="button" className="settings-link" disabled={data?.offline || busy !== null} onClick={() => run("test", actions?.onTestPush, "Notificação de teste enviada.")}><Icon name="bell" size={18} /> Enviar notificação de teste <Icon name="arrowRight" size={17} /></button>}</section>

      <section className="surface settings-section"><div className="settings-section-heading"><span className="settings-heading-icon"><Icon name="wallet" size={20} /></span><div><h2>Seus dados</h2><p>Adicione e guarde seus lançamentos</p></div></div><button type="button" className="settings-link" onClick={onPaste} disabled={!actions?.onIngestRaw || data?.offline}><Icon name="spark" size={18} /> Colar texto de uma compra <Icon name="arrowRight" size={17} /></button><button type="button" className="settings-link" onClick={() => setImportOpen(true)} disabled={!actions?.onImportStatement || !(data?.cards ?? []).some((card) => !card.archived) || data?.offline}><Icon name="list" size={18} /> Importar fatura CSV ou OFX <Icon name="arrowRight" size={17} /></button><div className="settings-action-row"><div><strong>Exportar histórico</strong><span>Baixe suas transações para guardar uma cópia.</span></div><div className="export-actions"><button type="button" className="button button-outline" disabled={!actions?.onExport || data?.offline || busy !== null} onClick={() => run("csv", () => actions?.onExport?.("csv"))}>CSV</button><button type="button" className="button button-outline" disabled={!actions?.onExport || data?.offline || busy !== null} onClick={() => run("json", () => actions?.onExport?.("json"))}>JSON</button></div></div></section>

      <section className="surface settings-section"><div className="settings-section-heading"><span className="settings-heading-icon"><Icon name="logout" size={20} /></span><div><h2>Sessão</h2><p>Encerre o acesso neste aparelho</p></div></div><button type="button" className="settings-link settings-link-danger" disabled={!actions?.onLogout || busy !== null} onClick={() => run("logout", actions?.onLogout)}><Icon name="logout" size={18} /> Sair da conta <Icon name="arrowRight" size={17} /></button></section></div>

      <aside className="settings-aside"><section className="surface install-card"><span className="install-icon"><Icon name="plus" size={24} /></span><p className="eyebrow">NO SEU IPHONE</p><h2>Instale na tela inicial</h2><p>Abra este site no Safari, toque em <strong>Compartilhar</strong> e escolha <strong>Adicionar à Tela de Início</strong>.</p><span className="install-chip"><Icon name="check" size={15} /> Acesso rápido, como um app</span></section><section className="privacy-card"><Icon name="shield" size={22} /><h3>Privacidade em primeiro lugar</h3><p>Seus gastos são pessoais. O app não usa telemetria.</p></section></aside></div>
    {importOpen && actions?.onImportStatement && <ImportStatementDialog cards={data?.cards ?? []} onClose={() => setImportOpen(false)} onSubmit={actions.onImportStatement} />}
  </div>;
}
