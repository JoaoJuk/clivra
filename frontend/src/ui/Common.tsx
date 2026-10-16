import type { ReactNode } from "react";
import type { Card, Category, Transaction } from "../lib/types";
import { formatDate, formatMoney } from "./format";
import { Icon, type IconName } from "./Icon";

export function SurfaceHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="surface-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</div>;
}

export function EmptyState({ icon, title, description, action }: { icon: IconName; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state-icon"><Icon name={icon} size={27} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function CategoryBadge({ category }: { category?: Category | null }) {
  if (!category) return <span className="category-badge category-badge-unknown">Sem categoria</span>;
  return <span className="category-badge"><span>{category.icon}</span>{category.name}</span>;
}

export function TransactionRow({ transaction, card, category }: { transaction: Transaction; card?: Card; category?: Category }) {
  const isRefund = transaction.amountCents < 0;
  const name = transaction.merchantName || transaction.merchantRaw;
  const isMuted = transaction.status === "ignored" || transaction.status === "refunded";
  return <article className={`transaction-row${isMuted ? " transaction-row-muted" : ""}`}>
    <div className="transaction-avatar" style={{ color: category?.color || "#789387", backgroundColor: category ? `${category.color}1a` : "#edf2ed" }} aria-hidden="true">{category?.icon || (isRefund ? "↩" : "•")}</div>
    <div className="transaction-main"><strong title={name}>{name}</strong><span>{formatDate(transaction.occurredAt)} <i aria-hidden="true">·</i> {card?.name || "Cartão"}</span></div>
    <div className="transaction-end"><strong className={isRefund ? "refund-amount" : ""}>{isRefund ? "+" : "−"}{formatMoney(Math.abs(transaction.amountCents))}</strong>{transaction.status === "pending_category" ? <span className="transaction-pending">Classificar</span> : <span className="transaction-category">{category?.name || (isMuted ? "Desconsiderado" : "Sem categoria")}</span>}</div>
  </article>;
}

export function StatusPill({ offline, loading }: { offline?: boolean; loading?: boolean }) {
  return <span className={`status-pill ${offline ? "status-pill-offline" : ""}`}><span className="status-dot" />{offline ? "Modo offline" : loading ? "Sincronizando" : "Atualizado"}</span>;
}
