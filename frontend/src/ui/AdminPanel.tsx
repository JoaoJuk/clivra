import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminInvite, AdminUser, SystemStatus } from "../lib/types";
import { Icon } from "./Icon";

// Painel do admin (D16, contrato §17): saúde do sistema, pessoas e convites.
// Só dados de conta — nenhum gasto de outra pessoa passa por aqui.
export interface AdminApi {
  system: () => Promise<SystemStatus>;
  users: () => Promise<{ data: AdminUser[] }>;
  invites: () => Promise<{ data: AdminInvite[] }>;
  invite: (email: string) => Promise<AdminInvite>;
  revokeInvite: (id: string) => Promise<void>;
  userAction: (id: string, action: "disable" | "enable" | "revoke-sessions") => Promise<void>;
}

interface AdminPanelProps {
  api: AdminApi;
  currentUserId?: string;
  offline?: boolean;
  setNotice: (message: string | null) => void;
}

const environmentLabel: Record<SystemStatus["environment"], string> = {
  production: "Produção",
  staging: "Homologação",
  development: "Desenvolvimento",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "nunca";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function AdminPanel({ api, currentUserId, offline, setNotice }: AdminPanelProps) {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [systemResult, usersResult, invitesResult] = await Promise.all([api.system(), api.users(), api.invites()]);
      setSystem(systemResult);
      setUsers(usersResult.data);
      setInvites(invitesResult.data);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Não foi possível carregar o painel.");
    }
  }, [api]);

  useEffect(() => { if (!offline) void load(); }, [load, offline]);

  async function run(key: string, action: () => Promise<unknown>, success: string, confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Não foi possível concluir esta ação.");
    } finally {
      setBusy(null);
    }
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    void run("invite", async () => { await api.invite(email); setInviteEmail(""); }, `Convite enviado para ${email}.`);
  }

  if (offline) {
    return <section className="surface settings-section admin-panel"><AdminHeading /><p className="admin-muted">O painel admin precisa de conexão.</p></section>;
  }

  return <section className="surface settings-section admin-panel" aria-labelledby="admin-title">
    <AdminHeading />
    {loadError && <div className="admin-error" role="alert"><span>{loadError}</span><button type="button" className="button button-outline" onClick={() => void load()}>Tentar novamente</button></div>}

    <h3 className="admin-subtitle">Sistema</h3>
    {system ? <dl className="admin-system">
      <div><dt>Ambiente</dt><dd>{environmentLabel[system.environment]}</dd></div>
      <div><dt>API</dt><dd><span className={`admin-dot ${system.database === "ok" ? "admin-dot-ok" : "admin-dot-bad"}`} aria-hidden="true" />{system.database === "ok" ? "No ar" : "Banco com problema"}</dd></div>
      <div><dt>Versão</dt><dd className="admin-mono">{system.release}</dd></div>
      <div><dt>Último backup</dt><dd>{system.environment === "production" ? formatDateTime(system.lastBackupAt) : "não se aplica"}</dd></div>
    </dl> : !loadError && <p className="admin-muted" role="status">Carregando...</p>}

    <h3 className="admin-subtitle">Pessoas</h3>
    <ul className="admin-list">
      {users.map((person) => {
        const isSelf = person.id === currentUserId;
        return <li key={person.id} className="admin-person">
          <div className="admin-person-info">
            <strong>{person.name}{isSelf ? " (você)" : ""}{person.role === "admin" ? <span className="admin-badge">admin</span> : null}{person.disabledAt ? <span className="admin-badge admin-badge-off">bloqueada</span> : null}</strong>
            <span>{person.email}</span>
            <span className="admin-muted">Último acesso: {formatDateTime(person.lastLoginAt)} · {person.activeSessions} {person.activeSessions === 1 ? "aparelho" : "aparelhos"}</span>
          </div>
          <div className="admin-person-actions">
            <button type="button" className="button button-outline" disabled={busy !== null || person.activeSessions === 0} onClick={() => void run(`sessions-${person.id}`, () => api.userAction(person.id, "revoke-sessions"), isSelf ? "Seus aparelhos foram desconectados." : `${person.name} foi desconectada de todos os aparelhos.`, isSelf ? "Desconectar todos os seus aparelhos? Você precisará entrar de novo." : `Desconectar ${person.name} de todos os aparelhos?`)}>Desconectar</button>
            {!isSelf && (person.disabledAt
              ? <button type="button" className="button button-outline" disabled={busy !== null} onClick={() => void run(`enable-${person.id}`, () => api.userAction(person.id, "enable"), `${person.name} foi desbloqueada.`)}>Desbloquear</button>
              : <button type="button" className="button button-outline admin-danger" disabled={busy !== null} onClick={() => void run(`disable-${person.id}`, () => api.userAction(person.id, "disable"), `${person.name} foi bloqueada.`, `Bloquear ${person.name}? A pessoa sai de todos os aparelhos e não consegue entrar até você desbloquear.`)}>Bloquear</button>)}
          </div>
        </li>;
      })}
    </ul>

    <h3 className="admin-subtitle">Convites</h3>
    {invites.length > 0 ? <ul className="admin-list">
      {invites.map((invite) => <li key={invite.id} className="admin-person">
        <div className="admin-person-info"><strong>{invite.email}</strong><span className="admin-muted">Vence em {daysLeft(invite.expiresAt)} {daysLeft(invite.expiresAt) === 1 ? "dia" : "dias"}</span></div>
        <div className="admin-person-actions"><button type="button" className="button button-outline" disabled={busy !== null} onClick={() => void run(`revoke-${invite.id}`, () => api.revokeInvite(invite.id), "Convite revogado.", `Revogar o convite de ${invite.email}?`)}>Revogar</button></div>
      </li>)}
    </ul> : <p className="admin-muted">Nenhum convite pendente.</p>}
    <form className="admin-invite" onSubmit={submitInvite}>
      <label className="field-label" htmlFor="admin-invite-email">Convidar por e-mail</label>
      <div className="admin-invite-row">
        <input id="admin-invite-email" className="field-input" type="email" inputMode="email" autoComplete="off" placeholder="pessoa@exemplo.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
        <button type="submit" className="button button-primary" disabled={busy !== null}>{busy === "invite" ? "Enviando..." : "Enviar convite"}</button>
      </div>
      <p className="admin-muted">A pessoa recebe um e-mail e cria a conta com ele. Cada um vê só os próprios gastos — você também não vê os dela.</p>
    </form>
  </section>;
}

function AdminHeading() {
  return <div className="settings-section-heading"><span className="settings-heading-icon"><Icon name="shield" size={20} /></span><div><h2 id="admin-title">Painel admin</h2><p>Visível só para você</p></div></div>;
}
