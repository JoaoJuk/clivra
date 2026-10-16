import { useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import "./styles.css";

export type AuthMode = "login" | "register";
export interface AuthPayload { email: string; password: string; name?: string; setupCode?: string }
export interface AuthViewProps {
  onSubmit: (mode: AuthMode, payload: AuthPayload) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  offlineAvailable?: boolean;
  onOpenOffline?: () => void;
}

function BrandSignature() {
  return (
    <div className="auth-signature" aria-label="Clivra">
      <img src="/clivra-symbol.svg" alt="" width="42" height="42" />
      <span>CLIVRA</span>
    </div>
  );
}

export function AuthView({ onSubmit, loading = false, error, offlineAvailable, onOpenOffline }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (loading || localBusy) return;
    if (mode === "register" && !name.trim()) { setLocalError("Informe seu nome."); return; }
    if (mode === "register" && password.length < 8) { setLocalError("A senha precisa ter pelo menos 8 caracteres."); return; }
    setLocalBusy(true);
    try {
      await onSubmit(mode, { email: email.trim(), password, ...(mode === "register" ? { name: name.trim(), setupCode: setupCode.trim() } : {}) });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Não foi possível acessar sua conta.");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <main className="auth-layout auth-refined">
      <section className="auth-form-shell" aria-labelledby="auth-title">
        <div className="auth-form-inner">
          <BrandSignature />

          <div className="auth-intro">
            <span className="auth-section-label">ACESSO À CONTA</span>
            <h1 id="auth-title">{mode === "login" ? "Bom ter você de volta." : "Comece por aqui."}</h1>
            <p>{mode === "login" ? "Seus cartões e gastos, organizados em um só lugar." : "Crie sua conta para acompanhar cada compra com clareza."}</p>
          </div>

          <form onSubmit={submit} className="auth-form">
            {mode === "register" && (
              <label className="auth-field">
                <span>Nome</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Seu nome" required />
              </label>
            )}
            <label className="auth-field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" required />
            </label>
            <label className="auth-field">
              <span>Senha</span>
              <span className="auth-password-wrap">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres" minLength={mode === "register" ? 8 : undefined} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "Ocultar" : "Mostrar"}</button>
              </span>
            </label>
            {mode === "register" && (
              <label className="auth-field">
                <span>Código de configuração</span>
                <input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Fornecido na instalação do servidor" />
              </label>
            )}
            {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}
            <button type="submit" className="auth-submit" disabled={loading || localBusy}>
              <span>{loading || localBusy ? "Aguarde..." : mode === "login" ? "Entrar na conta" : "Criar conta"}</span>
              <Icon name="arrowRight" size={19} />
            </button>
          </form>

          <div className="auth-switch">
            <span>{mode === "login" ? "Ainda não tem uma conta?" : "Já tem uma conta?"}</span>
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setPassword(""); setSetupCode(""); setShowPassword(false); setLocalError(null); }}>{mode === "login" ? "Criar conta" : "Entrar"}</button>
          </div>
          {offlineAvailable && onOpenOffline && <button type="button" className="auth-offline" onClick={onOpenOffline}><Icon name="wifiOff" size={17} /> Ver últimos dados offline</button>}
        </div>
        <p className="auth-legal">© 2026 CLIVRA</p>
      </section>

      <aside className="auth-visual" aria-label="Apresentação do aplicativo">
        <div className="auth-visual-top"><span>FINANÇAS PESSOAIS</span><span>CONTROLE DE GASTOS</span></div>
        <div className="auth-visual-body">
          <span className="auth-visual-rule" aria-hidden="true" />
          <h2>Clareza para decidir. Controle para seguir.</h2>
          <p>Uma leitura simples dos gastos em todos os seus cartões.</p>
          <div className="auth-preview" aria-label="Prévia ilustrativa do painel">
            <div className="auth-preview-head"><span>VISÃO DO MÊS</span><span>OUTUBRO 2026</span></div>
            <div className="auth-preview-total"><small>Gastos no período</small><strong>R$ 3.284,60</strong></div>
            <div className="auth-preview-divider" />
            <div className="auth-preview-row"><span>Mercado</span><span className="auth-preview-track"><i style={{ width: "74%" }} /></span><strong>38%</strong></div>
            <div className="auth-preview-row"><span>Restaurantes</span><span className="auth-preview-track"><i style={{ width: "47%" }} /></span><strong>24%</strong></div>
            <div className="auth-preview-row"><span>Transporte</span><span className="auth-preview-track"><i style={{ width: "28%" }} /></span><strong>14%</strong></div>
          </div>
        </div>
        <p className="auth-visual-foot">EXEMPLO DE VISUALIZAÇÃO <span>CLIVRA © 2026</span></p>
      </aside>
    </main>
  );
}

export default AuthView;
