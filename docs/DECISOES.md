# Decisões, status e pendências

Última atualização: 2026-10-16. Este arquivo mostra **só o estado atual**. O
histórico completo (discussões, pendências já resolvidas) está no git:
`git log -p docs/DECISOES.md`.

---

## Status por tela

| Tela | Front (ChatGPT) | Back (Claude) | Produção |
|---|---|---|---|
| Login / Criar conta | ✅ (falta P-18) | ✅ + código por e-mail | ✅ testado no iPhone |
| Cartões | ✅ com mock | ⬜ **próxima** | — |
| Lançar compra (colar / manual) | ✅ com mock | ⬜ | — |
| Transações | ✅ com mock | ⬜ | — |
| Pendências (perguntas de categoria) | ✅ com mock | ⬜ | — |
| Início / Gastos (dashboards) | ✅ com mock | ⬜ | — |
| Ajustes (push, export, regras) | ✅ com mock | ⬜ | — |

**Próximo passo:** back-end da tela **Cartões** (`/v1/cards` e `/v1/categories`).

---

## Decisões vigentes

| # | Tema | Decisão |
|---|---|---|
| D1 | Bancos da v1 | Nubank e Itaú |
| D5 | Autenticação | E-mail + senha, **um único dono**. O 1º cadastro exige o código de configuração (`OWNER_SETUP_CODE`, guardado na VPS) |
| D6 | Categorias | Lista fechada definida pelo back (contrato §4) |
| D7 | Melhorias | M1 parcelamento, M2 assinaturas, M3 orçamento, M4 dedupe, M5 estorno, M6 export — todas aceitas |
| D10 | Captura no iPhone | Colar texto + Atalhos do iOS → `POST /v1/ingest/raw`. Sem Open Finance, e-mail ou OCR de print |
| D11 | Categorização | Regra aprendida → dicionário local → **Jev** → pergunta (detalhe abaixo) |
| D12 | Hospedagem | Vercel (PWA + proxy `/v1/*`) + VPS **Oracle Always Free** (API + Postgres) em `clivra-api.163-176-182-24.sslip.io`. Sessão em cookie `HttpOnly` |
| D14 | Código por e-mail | Código de 6 dígitos no **Criar conta** (prova que o e-mail é seu antes de a conta existir) e no **Esqueci a senha**. Envio por SMTP do Gmail `clivra.net@gmail.com` com senha de app (grátis, ~500/dia), segredo em `/etc/clivra/clivra.env`. **SMS descartado** (pago, fere P6). O e-mail leva só o código (P4) |
| D15 | Homologação | Branch `develop` → **homologação** (Vercel Preview + API `clivra-api-hml…sslip.io`, banco `clivra_hml` com dados de teste, usuário Linux próprio). `main` → **produção**. Nada vai para `main` sem o humano testar na homologação. `deploy.sh prod` só aceita `origin/main` |
| D13 | Infra da VPS | Node 24 e Postgres 16 nativos (sem Docker), systemd com sandbox, Caddy, backup diário local. Ver `backend/CLAUDE.md` |

Substituídas: D2 "sem LLM" (→ D11); D3, D4, D8 e D9 "Cloudflare Tunnel" (→ D12/D13).

### D11 — Jev na categorização

- O Jev (TypeSafe AI) recebe as 19 categorias e devolve uma, com probabilidade
  por opção. Confiança ≥ limiar ⇒ grava com `categorySource: "model"`. Abaixo
  disso ⇒ vira pergunta, e as 3 opções mais prováveis viram os botões de 1 toque.
- **Só o nome do estabelecimento sai da VPS** — nunca valor, data ou cartão (P4).
- O app **nunca depende dele:** timeout curto; falhou ⇒ vira pergunta.
  Desliga com `CATEGORIZER_MODEL=off`. O limiar é calibrado antes de ligar.
- Entra junto com a tela Pendências. A chave fica só no `.env` da VPS.

---

## Acordos de API propostos pelo back — aguardando OK do front

Entram no contrato como **v1.1.0** (só adições) quando o ChatGPT confirmar.

| Ref. | Acordo |
|---|---|
| P-05 | Ação de categoria no push: aceito o fluxo do front (o SW guarda a escolha no IndexedDB; o app autentica e responde). `answer` é idempotente. |
| P-06 | `dismiss` sem categoria: a transação continua `pending_category` e a pergunta vira `dismissed` (sai do contador), podendo ser respondida depois. Com categoria: categoriza **sem** criar regra. |
| P-07 | `period=statement` com vários cartões soma por `statementMonth` e ganha `period.cycles[]`. O `byGroup` inclui `{ group: null }` (não categorizado) para somar `netCents`. |
| P-08 | `Transaction.source` ganha `"paste"`. Print/OCR fora da v1. |
| P-09 | `from`/`to` sem hora = dia local de `America/Sao_Paulo`, com `to` inclusivo. |
| P-12 | `GET /v1/summary/months` ganha `budgetCents` (meta vigente em cada mês). **Push com texto genérico na tela bloqueada** (sem valor nem estabelecimento). |
| D11 | `categorySource` e `suggestions[].reason` ganham o valor `"model"`. |

---

## Pendências abertas

### P-19 — Preview da Vercel chamar a API de homologação (ChatGPT)
Hoje o `vercel.json` manda `/v1/*` sempre para a produção, inclusive no
Preview. Precisa: deploy de Preview (branch `develop`) → proxy para
`https://clivra-api-hml.163-176-182-24.sslip.io`; Production → a API atual.
Rewrite do `vercel.json` não varia por ambiente; provavelmente exige Vercel
Routing Middleware lendo `VERCEL_ENV`. Dá para juntar com a **P-15** (o
mesmo middleware manda o cabeçalho secreto). Deixar a Deployment Protection
da Vercel ligada nos Previews.

### P-18 — Telas do código por e-mail (ChatGPT) — **bloqueia o cadastro**
Contrato 1.0.3, §1. Back pronto e em produção. **Urgente:** o banco de produção
está sem conta (conferido em 2026-10-16) e o cadastro agora exige `emailCode`,
então pelo app ninguém consegue criar a conta até esta tela existir.
1. **Criar conta:** depois do formulário, `POST /v1/auth/email-code`
   (`purpose: "register"`, com `setupCode`); tela "Digite o código enviado para
   <e-mail>" (6 dígitos, `inputmode="numeric"`, `autocomplete="one-time-code"`)
   → `POST /v1/auth/register` com `emailCode`. Botão "Reenviar" com contagem
   de `resendIn` segundos. `INVALID_EMAIL_CODE` ⇒ mensagem + reenviar.
2. **Login:** link "Esqueci minha senha" → e-mail → `POST /v1/auth/email-code`
   (`purpose: "password_reset"`) → código + nova senha →
   `POST /v1/auth/password-reset` → `204` ⇒ volta ao login com aviso
   "Senha alterada. Entre com a nova senha."
3. Sempre dizer "Se houver conta com esse e-mail, enviamos um código" no
   esqueci a senha (o back não revela se a conta existe).

### P-16 — Segurança do front, itens restantes (ChatGPT)
Os itens 1–2 (rewrite `/v1` e headers de segurança no `vercel.json`) e a P-14
(campo de código no Criar conta) **já foram feitos pelo Claude**, com autorização
do humano, no commit `ff680c7`. Revise se quiser. Falta, por prioridade:
1. **Cache offline:** hoje o cache inteiro (transações, perguntas, resumo) fica
   7 dias em `localStorage` e aparece **sem login** com o celular offline.
   Persistir só o que não é sensível (`categories`, no máximo o resumo do mês),
   `maxAge` de 24 h e sessão offline com prazo curto.
2. **Logout desliga o push** (`disablePush()` antes de `api.logout()`).
3. **IndexedDB do service worker com prazo:** descartar texto compartilhado e
   ação de push com mais de 10 min; limpar no logout.
4. `POST /share` vindo de outro site (`Sec-Fetch-Site: cross-site`) ⇒ descartar.
5. `cartao.lastUser` guarda só `{ id, name }`, sem e-mail.
6. Logout limpa as outras abas (evento `storage`).
7. **Logout que falha não pode fingir que saiu** (`App.tsx:283-289`,
   `api.ts:162-168`): hoje, sem rede, mostra o login mas o cookie e o refresh
   continuam válidos e a próxima abertura entra sem senha. Manter a sessão e
   avisar, ou guardar "logout pendente" e repetir antes de qualquer `refresh()`.
8. **Sessão offline só offline de verdade** (`App.tsx:56-58`): hoje qualquer
   erro do refresh (429, 5xx) abre os dados guardados mesmo online. Só com
   `navigator.onLine === false` ou erro de rede, e prazo de 24 h.

> Revisão de 2026-10-16 (Semgrep da Trail of Bits + manual): itens 1–6 seguem
> abertos; 7–8 são novos. XSS, tokens, service worker, CSP/headers, segredos
> no bundle e dependências estão OK; `npm audit` sem vulnerabilidades.

### P-15 — VPS aceitar só tráfego vindo da Vercel (Claude + ChatGPT, sem pressa)
Hoje quem souber a URL sslip.io chama a API direto. O back já se protege
(rate limit, limite por conta, código no cadastro), mas o ideal é o Caddy
recusar o que não veio da Vercel — provavelmente com Vercel Routing Middleware
injetando um cabeçalho secreto. Envolve front e VPS.

### P-17 — Tirar o `refreshToken` do corpo da resposta (Claude)
O front já usa só o cookie. Remover o campo do corpo de `login`/`register`/
`refresh` (contrato v2.0.0) depois que o ChatGPT confirmar que não depende dele.

### Riscos aceitos
- O access token vale até 15 min depois do logout **e da troca de senha** (app de 1 pessoa).
- "Esqueci a senha" tem teto de 5 códigos/dia por e-mail: quem souber seu
  e-mail pode gastar o teto, mas os códigos chegam na **sua** caixa e qualquer
  um ainda válido serve. Saída de emergência: `ssh oracle`.
- O backup do banco fica no mesmo disco da VPS. Futuro: cópia no Object Storage
  grátis da Oracle (20 GB).
- A Oracle desliga VPS ociosa por 7 dias (CPU, rede e memória < 20%); ela avisa
  por e-mail antes.

---

## Descartados (não reabrir sem motivo novo)

| Opção | Motivo |
|---|---|
| Ler notificação do iOS | Impossível: o iOS não expõe essa API. |
| App Store | Decisão de produto: PWA na tela inicial. |
| Pluggy / Open Finance | A partir de R$ 2.500/mês; o usuário não quer. |
| Cloudflare Tunnel | Exige domínio próprio para URL fixa → sslip.io no lugar. |
| Back-end na Vercel + Neon | Dados em terceiro e proteções em memória não funcionam em serverless; a VPS já existe. |
| Docker na VPS | Gasta RAM à toa; Node e Postgres nativos bastam. |
| Domínio pago | Custo; sslip.io + proxy da Vercel resolvem de graça. |

---

## Roadmap do back-end (na ordem das telas)

1. **Cartões:** CRUD de `/v1/cards`, `GET /v1/categories`.
2. **Lançar compra:** `POST /v1/transactions` (dedupe M4, parcelamento M1),
   `POST /v1/ingest/raw` + parsers Nubank/Itaú, atalho do iOS.
3. **Transações:** listagem com filtros e paginação, edição, estorno (M5), lote.
4. **Pendências:** categorizador (dicionário + Jev), `questions`, `rules`.
5. **Início / Gastos:** `summary`, `summary/months`, `insights`, orçamentos (M3),
   assinaturas (M2), `forecast`.
6. **Ajustes:** Web Push (VAPID), export (M6).
7. **Infra:** backup fora da VPS, P-15, P-17.
