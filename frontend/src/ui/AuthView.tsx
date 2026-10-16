import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "./Icon";
import "./styles.css";

export type AuthMode = "login" | "register";
// Passos da tela: o cadastro e o "esqueci a senha" têm um passo de código por e-mail (contrato 1.0.3).
type AuthStep = "login" | "register" | "register-code" | "forgot" | "reset";
export interface AuthPayload { email: string; password: string; name?: string; setupCode?: string; emailCode?: string }
export interface AuthViewProps {
  onSubmit: (mode: AuthMode, payload: AuthPayload) => Promise<void> | void;
  onRequestCode: (input: { email: string; purpose: "register" | "password_reset"; setupCode?: string }) => Promise<{ resendIn: number }>;
  onResetPassword: (input: { email: string; emailCode: string; newPassword: string }) => Promise<void>;
  // owner_setup = ninguém cadastrado ainda (pede o código de configuração);
  // invite_only = só quem recebeu convite do admin (contrato 1.0.4).
  registrationMode?: "owner_setup" | "invite_only";
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

function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="auth-field">
      <span>Código de 6 dígitos</span>
      <span className="code-wrap">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
        />
        <span className="code-blocks" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <span key={index}>{value[index] || ""}</span>)}
        </span>
      </span>
    </label>
  );
}

const copy: Record<AuthStep, { title: string; description: (email: string) => string; submit: string }> = {
  login: { title: "Bom ter você de volta.", description: () => "Seus cartões e gastos, organizados em um só lugar.", submit: "Entrar na conta" },
  register: { title: "Comece por aqui.", description: () => "Crie sua conta para acompanhar cada compra com clareza.", submit: "Continuar" },
  "register-code": { title: "Confira seu e-mail.", description: (email) => `Digite o código enviado para ${email}.`, submit: "Confirmar e criar conta" },
  forgot: { title: "Recupere seu acesso.", description: () => "Informe seu e-mail para receber um código de recuperação.", submit: "Enviar código" },
  reset: { title: "Defina uma nova senha.", description: () => "Se houver conta com esse e-mail, enviamos um código. Use-o abaixo para alterar sua senha.", submit: "Alterar senha" },
};

export function AuthView({ onSubmit, onRequestCode, onResetPassword, registrationMode = "invite_only", loading = false, error, offlineAvailable, onOpenOffline }: AuthViewProps) {
  const ownerSetup = registrationMode === "owner_setup";
  const [step, setStep] = useState<AuthStep>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  function goTo(next: AuthStep) {
    setStep(next);
    setLocalError(null);
    setEmailCode("");
    setShowPassword(false);
    if (next === "login" || next === "register") { setPassword(""); setSetupCode(""); }
  }

  async function requestCode(purpose: "register" | "password_reset") {
    const result = await onRequestCode({ email: email.trim(), purpose, ...(purpose === "register" && ownerSetup ? { setupCode: setupCode.trim() } : {}) });
    setNow(Date.now());
    setResendAt(Date.now() + result.resendIn * 1000);
  }

  async function run(action: () => Promise<void>) {
    setLocalError(null);
    if (loading || localBusy) return;
    setLocalBusy(true);
    try {
      await action();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Não foi possível acessar sua conta.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (step === "register" && !name.trim()) { setLocalError("Informe seu nome."); return; }
    if ((step === "register" || step === "reset") && password.length < 8) { setLocalError("A senha precisa ter pelo menos 8 caracteres."); return; }
    if ((step === "register-code" || step === "reset") && emailCode.length !== 6) { setLocalError("Digite os 6 dígitos do código."); return; }
    await run(async () => {
      if (step === "login") await onSubmit("login", { email: email.trim(), password });
      else if (step === "register") { await requestCode("register"); setStep("register-code"); }
      else if (step === "register-code") await onSubmit("register", { email: email.trim(), password, name: name.trim(), ...(ownerSetup ? { setupCode: setupCode.trim() } : {}), emailCode });
      else if (step === "forgot") { await requestCode("password_reset"); setPassword(""); setStep("reset"); }
      else {
        await onResetPassword({ email: email.trim(), emailCode, newPassword: password });
        goTo("login");
        setNotice("Senha alterada. Entre com a nova senha.");
      }
    });
  }

  function resend() {
    void run(() => requestCode(step === "register-code" ? "register" : "password_reset"));
  }

  const text = copy[step];
  const codeStep = step === "register-code" || step === "reset";

  return (
    <main className="auth-layout auth-refined">
      <section className="auth-form-shell" aria-labelledby="auth-title">
        <div className="auth-form-inner">
          <BrandSignature />

          <div className="auth-intro">
            <span className="auth-section-label">ACESSO À CONTA</span>
            <h1 id="auth-title">{text.title}</h1>
            <p>{step === "register" && !ownerSetup ? "Use o e-mail que recebeu o convite do administrador." : text.description(email.trim())}</p>
          </div>

          <form onSubmit={submit} className="auth-form">
            {step === "register" && (
              <label className="auth-field">
                <span>Nome</span>
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Seu nome" required />
              </label>
            )}
            {(step === "login" || step === "register" || step === "forgot") && (
              <label className="auth-field">
                <span>E-mail</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" required />
              </label>
            )}
            {codeStep && <CodeInput value={emailCode} onChange={setEmailCode} />}
            {(step === "login" || step === "register" || step === "reset") && (
              <label className="auth-field">
                <span>{step === "reset" ? "Nova senha" : "Senha"}</span>
                <span className="auth-password-wrap">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={step === "login" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres" minLength={step === "login" ? undefined : 8} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "Ocultar" : "Mostrar"}</button>
                </span>
              </label>
            )}
            {step === "login" && <button type="button" className="auth-link auth-link-end" onClick={() => goTo("forgot")}>Esqueci minha senha</button>}
            {step === "register" && ownerSetup && (
              <label className="auth-field">
                <span>Código de configuração</span>
                <input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Fornecido na instalação do servidor" />
              </label>
            )}
            {codeStep && <p className="auth-help">O código vale por 10 minutos. Confira também a pasta de spam.</p>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}
            <button type="submit" className="auth-submit" disabled={loading || localBusy}>
              <span>{loading || localBusy ? "Aguarde..." : text.submit}</span>
              <Icon name="arrowRight" size={19} />
            </button>
            {codeStep && (
              <button type="button" className="auth-link" onClick={resend} disabled={resendIn > 0 || localBusy}>
                {resendIn > 0 ? `Reenviar código em ${resendIn} s` : "Reenviar código"}
              </button>
            )}
          </form>

          <div className="auth-switch">
            {step === "login" && <><span>Ainda não tem uma conta?</span><button type="button" onClick={() => goTo("register")}>Criar conta</button></>}
            {step === "register" && <><span>Já tem uma conta?</span><button type="button" onClick={() => goTo("login")}>Entrar</button></>}
            {step === "register-code" && <button type="button" onClick={() => goTo("register")}>Voltar ao cadastro</button>}
            {(step === "forgot" || step === "reset") && <button type="button" onClick={() => goTo("login")}>Voltar ao login</button>}
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
