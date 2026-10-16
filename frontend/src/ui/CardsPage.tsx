import { useState, type FormEvent } from "react";
import type { Card, CreateCardInput } from "../lib/types";
import type { AppViewActions, AppViewData, ViewName } from "./types";
import { EmptyState } from "./Common";
import { formatMoney, parseMoneyInput } from "./format";
import { Icon } from "./Icon";

interface CardsPageProps {
  data?: AppViewData;
  actions?: AppViewActions;
  onNavigate: (view: ViewName) => void;
  setNotice: (message: string | null) => void;
}

const bankColors: Record<string, string> = { nubank: "#7436ad", itau: "#f18b26", other: "#205c50" };

function CardDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: CreateCardInput) => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [bank, setBank] = useState<"nubank" | "itau" | "other">("nubank");
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [brand, setBrand] = useState<"visa" | "mastercard" | "elo" | "amex" | "hipercard" | "other">("mastercard");
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError("Dê um nome para identificar o cartão."); return; }
    if (lastFourDigits && !/^\d{4}$/.test(lastFourDigits)) { setError("Informe exatamente os 4 últimos dígitos."); return; }
    const limitCents = limit ? parseMoneyInput(limit) : null;
    if (limit && (limitCents == null || limitCents <= 0)) { setError("Informe um limite válido em reais."); return; }
    const closing = closingDay ? Number(closingDay) : null;
    const due = dueDay ? Number(dueDay) : null;
    if ([closing, due].some((value) => value != null && (!Number.isInteger(value) || value < 1 || value > 31))) { setError("Os dias de fechamento e vencimento devem estar entre 1 e 31."); return; }
    const input: CreateCardInput = { name: name.trim(), bank, brand, type, color: bankColors[bank], ...(lastFourDigits ? { lastFourDigits } : {}), ...(type === "credit" && closing != null ? { closingDay: closing } : {}), ...(type === "credit" && due != null ? { dueDay: due } : {}), ...(type === "credit" && limitCents != null ? { limitCents } : {}) };
    setBusy(true); setError(null);
    try { await onSubmit(input); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o cartão."); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="card-title"><div className="dialog-header"><span className="dialog-icon"><Icon name="card" size={22} /></span><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><h2 id="card-title">Adicionar cartão</h2><p>Cadastre o cartão para reunir as compras deste banco.</p><form onSubmit={submit} className="form-grid">
    <label className="field field-full"><span className="field-label">Nome do cartão</span><input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Nubank Roxinho" maxLength={80} required /></label>
    <label className="field"><span className="field-label">Banco</span><select className="field-input" value={bank} onChange={(event) => setBank(event.target.value as typeof bank)}><option value="nubank">Nubank</option><option value="itau">Itaú</option><option value="other">Outro</option></select></label>
    <label className="field"><span className="field-label">Tipo</span><select className="field-input" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="credit">Crédito</option><option value="debit">Débito</option></select></label>
    <label className="field"><span className="field-label">Bandeira</span><select className="field-input" value={brand} onChange={(event) => setBrand(event.target.value as typeof brand)}><option value="mastercard">Mastercard</option><option value="visa">Visa</option><option value="elo">Elo</option><option value="amex">American Express</option><option value="hipercard">Hipercard</option><option value="other">Outra</option></select></label>
    <label className="field"><span className="field-label">Últimos 4 dígitos <small>(opcional)</small></span><input className="field-input" value={lastFourDigits} onChange={(event) => setLastFourDigits(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="1234" /></label>
    {type === "credit" && <><label className="field"><span className="field-label">Fechamento <small>(opcional)</small></span><input className="field-input" type="number" min={1} max={31} value={closingDay} onChange={(event) => setClosingDay(event.target.value)} placeholder="Dia" /></label><label className="field"><span className="field-label">Vencimento <small>(opcional)</small></span><input className="field-input" type="number" min={1} max={31} value={dueDay} onChange={(event) => setDueDay(event.target.value)} placeholder="Dia" /></label><label className="field field-full"><span className="field-label">Limite <small>(opcional)</small></span><span className="input-prefix"><span>R$</span><input className="field-input" type="text" inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="0,00" /></span></label></>}
    {error && <p className="form-error field-full" role="alert">{error}</p>}<div className="dialog-actions field-full"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Salvando..." : "Adicionar cartão"}</button></div>
  </form></section></div>;
}

function BankCard({ card }: { card: Card }) {
  const color = card.color || bankColors[card.bank] || bankColors.other;
  return <div className="bank-card" style={{ background: `linear-gradient(135deg, ${color}, #173d3b)` }}><span className="bank-card-glow" aria-hidden="true" /><div className="bank-card-top"><span>{card.bank === "nubank" ? "NU" : card.bank === "itau" ? "itaú" : "cartão"}</span><Icon name="wallet" size={23} /></div><div className="bank-card-middle">•••• &nbsp; •••• &nbsp; •••• &nbsp; {card.lastFourDigits || "••••"}</div><div className="bank-card-bottom"><span>{card.name}</span><strong>{card.brand === "other" ? "" : card.brand}</strong></div></div>;
}

export function CardsPage({ data, actions, setNotice }: CardsPageProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const cards = (data?.cards ?? []).filter((card) => !card.archived);
  const byCard = data?.summary?.byCard ?? [];
  return <div className="page cards-page"><div className="page-heading"><div><p className="eyebrow">TUDO CONECTADO</p><h1>Seus cartões, <em>em um lugar.</em></h1><p>Acompanhe as compras por banco e tenha a visão completa.</p></div><button type="button" className="button button-primary" onClick={() => setDialogOpen(true)} disabled={!actions?.onCreateCard || data?.offline}><Icon name="plus" size={18} /> Adicionar cartão</button></div>
    {cards.length ? <div className="cards-grid">{cards.map((card) => { const summary = byCard.find((row) => row.cardId === card.id); return <article className="surface card-surface" key={card.id}><BankCard card={card} /><div className="card-surface-details"><div><span>Gasto no período</span><strong>{formatMoney(summary?.amountCents ?? 0)}</strong></div><div><span>Tipo</span><strong>{card.type === "credit" ? "Crédito" : "Débito"}</strong></div>{card.type === "credit" && card.limitCents != null && <div><span>Limite cadastrado</span><strong>{formatMoney(card.limitCents)}</strong></div>}{card.type === "credit" && (card.closingDay || card.dueDay) && <p>{card.closingDay && `Fecha dia ${card.closingDay}`}{card.closingDay && card.dueDay && " · "}{card.dueDay && `Vence dia ${card.dueDay}`}</p>}</div></article>; })}</div> : <section className="surface cards-empty"><EmptyState icon={data?.loading ? "refresh" : "card"} title={data?.loading ? "Carregando cartões" : "Comece pelo seu primeiro cartão"} description={data?.loading ? "Buscando seus cartões..." : "Cadastre seu Nubank, Itaú ou outro cartão para organizar todas as compras."} action={!data?.loading && <button type="button" className="button button-primary" onClick={() => setDialogOpen(true)} disabled={!actions?.onCreateCard || data?.offline}>Adicionar cartão <Icon name="arrowRight" size={17} /></button>} /></section>}
    {dialogOpen && actions?.onCreateCard && <CardDialog onClose={() => setDialogOpen(false)} onSubmit={async (input) => { await actions.onCreateCard?.(input); setNotice("Cartão adicionado com sucesso."); }} />}
  </div>;
}
