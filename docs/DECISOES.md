# Decisões, status e pendências

Última atualização: 2026-10-19. Este arquivo mostra **só o estado atual**. O
histórico completo (discussões, pendências já resolvidas) está no git:
`git log -p docs/DECISOES.md`.

---

## Status por tela

| Tela | Front (ChatGPT) | Back (Claude) | Produção |
|---|---|---|---|
| Login / Criar conta | ✅ + código por e-mail + convite | ✅ + família (D16) | ⏳ homologação: admin criado; falta testar convite |
| Painel admin (D16) | ✅ (Claude, autorizado) | ✅ | ⏳ testar na homologação |
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
| D5 | Autenticação | E-mail + senha + código por e-mail. O 1º cadastro (o admin) exige o código de configuração (`OWNER_SETUP_CODE`, guardado na VPS) |
| D17 | Categorias por pessoa | Lista **padrão** (contrato §4) para todos **+ categorias próprias** que cada pessoa cria, renomeia e apaga — visíveis só para ela. Regras aprendidas (P2) também são por pessoa. Entra com a tela Cartões/Categorias (exige mudança no contrato §4, acordada com o front). Decidido pelo humano em 2026-10-16 |
| D16 | Família | Um **admin** (quem instalou) e familiares **convidados** por ele (`member`). Sem cadastro aberto. **Mesmas telas para todos; gastos separados:** cada um vê só os seus. O admin tem a mais o **Painel admin** (seção no topo de Ajustes): saúde do sistema (ambiente, API, versão, último backup), pessoas (último acesso, aparelhos, bloquear/desconectar) e convites — nunca gastos dos outros. A homologação é só do admin (login da Vercel + banco próprio). Decidido pelo humano em 2026-10-16 |
| D6 | Categorias | ~~Lista fechada~~ → substituída pela D17 |
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

### P-21 — Revisão de segurança de 2026-10-19 (externa) — itens do front (ChatGPT)
O back já corrigiu a parte dele (ver P-15 e o Changelog 1.0.5 do contrato:
CSRF em `refresh`/`logout`, rate limit no `logout`, limpeza de
`refresh_tokens`/convites vencidos, `deploy.sh` fora do `/tmp`). Falta no front:
1. **Categorias de uma pessoa aparecendo para outra no mesmo aparelho (D17)**
   (`main.tsx`, `lib/query.ts`, `App.tsx`): a query `['categories']` é
   persistida no `localStorage` (`cartao.queryCache.v2`) sem o `user.id`, com
   `staleTime` de 24 h. Usar `['categories', user.id]` e, no `restore()`,
   descartar o cache persistido se `session.user.id` ≠ último usuário. Cuidado
   com o `throttleTime: 1000` do persister: `queryClient.clear()` seguido de
   `queryPersisterRemove()` pode ser regravado logo depois.
2. **Logout travado por falha do push** (`App.tsx` `onLogout`, `lib/push.ts`):
   se `DELETE /v1/push/subscribe` falhar (hoje dá 404 — a rota ainda não
   existe), `disablePush()` lança e `api.logout()` nunca roda. Fazer o
   `unsubscribe()` local e a chamada à API em `try/catch` próprio, e sempre
   seguir para `api.logout()` + `clearLocalData()`.
3. **`exportTransactions()` fora do `ApiClient.request()`** (`lib/api.ts`):
   falta `cache: 'no-store'` e a checagem de `loggingOut`/`generation`; um
   export em andamento termina mesmo depois do Sair.
4. **`npm run dev` com `--host 0.0.0.0`** (`frontend/package.json`): expõe o
   front e o proxy `/v1` para a rede Wi-Fi. Usar o padrão (localhost) e só
   abrir a rede quando for testar no iPhone (`npm run dev -- --host`).

### P-22 — 2FA no login (decisão do humano)
Hoje o login é só e-mail + senha; senha vazada ⇒ entra como admin. Como a
sessão dura 30 dias, um 2º fator no login quase não pesa no dia a dia (P3).
Opções: **A)** código de 6 dígitos por e-mail no login (reusa o serviço de
`email-codes` e a tela de código que já existe) ou **B)** app autenticador
(TOTP). Aguardando o humano escolher e se vale para todos ou só o admin.
Exige mudança no contrato §1 (acordo com o front).

### P-20 — Família: cadastro por convite e painel do admin — ✅ feito pelo Claude
O **Claude fez as telas com autorização do humano** (2026-10-16):
`ui/AdminPanel.tsx` (novo), `SettingsPage.tsx`, `AuthView.tsx`
(`registrationMode`), `App.tsx`, `lib/api.ts`, `lib/types.ts`,
`lib/sessionStorage.ts` (`role`), `styles.css`, `tests/admin.spec.ts` e
`tests/helpers.ts` (mock das rotas admin). ChatGPT: revise se quiser.
Registro do que foi pedido:
1. **Criar conta:** chamar `GET /v1/auth/registration`. `owner_setup` ⇒
   mostrar o campo Código de configuração (como hoje). `invite_only` ⇒
   esconder o campo e mostrar "Para criar conta, peça um convite ao
   administrador" (o resto do fluxo de código por e-mail não muda).
2. **Ajustes → "Família"** (só se `user.role === "admin"`): lista de pessoas
   (nome, e-mail, último acesso, nº de aparelhos, bloqueada?), botões
   Bloquear/Desbloquear e Desconectar aparelhos (com confirmação); convites
   pendentes com Revogar; campo "Convidar por e-mail".
3. Login com `403 FORBIDDEN` ⇒ mostrar a mensagem do servidor (conta bloqueada).
4. Nenhuma tela do admin mostra gasto de outra pessoa (D16).

### P-19 — Preview da Vercel chamar a API de homologação — ✅ feito (`frontend/middleware.ts`), falta a homologação no ar
Hoje o `vercel.json` manda `/v1/*` sempre para a produção, inclusive no
Preview. Precisa: deploy de Preview (branch `develop`) → proxy para
`https://clivra-api-hml.163-176-182-24.sslip.io`; Production → a API atual.
Rewrite do `vercel.json` não varia por ambiente; provavelmente exige Vercel
Routing Middleware lendo `VERCEL_ENV`. Dá para juntar com a **P-15** (o
mesmo middleware manda o cabeçalho secreto). Deixar a Deployment Protection
da Vercel ligada nos Previews.

### P-18 — Telas do código por e-mail — ✅ feito, falta testar na homologação
O ChatGPT fez o cliente da API (`api.ts`) e a prévia; o **Claude terminou as
telas** em `AuthView.tsx` (+ `styles.css`, `App.tsx`, `tests/email-code.spec.ts`)
**com autorização do humano** (2026-10-16): Criar conta → código → cadastro;
"Esqueci minha senha" → código + nova senha → login. ChatGPT: revise se quiser.

### P-16 — Segurança do front — ✅ itens 1–8 feitos pelo ChatGPT (testes Playwright), falta testar na homologação
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

### P-15 — VPS aceitar só tráfego vindo da Vercel — ✅ back pronto, falta front + segredo
Hoje quem souber a URL sslip.io (aparece nos logs de Certificate
Transparency) chama a API direto. E, com `TRUST_PROXY=1` e o Caddy (que
descarta o `X-Forwarded-For` de quem chega), o IP que a API enxerga é o da
Vercel: **toda a família divide o mesmo rate limit por IP** (ex.: 10 logins
errados em 15 min). Não dá para forjar IP hoje, mas dá para travar os outros.
**Back (feito, 2026-10-19):** com `PROXY_SECRET` (≥ 32 caracteres) no
`/etc/clivra/clivra.env`, a API responde `403 FORBIDDEN` a quem não mandar
`X-Clivra-Proxy-Secret` correto (exceto `GET /v1/health`, usado pelo deploy) e
usa `X-Clivra-Client-Ip` como IP do cliente nos rate limits. Sem a variável,
nada muda.
**Front (ChatGPT, `frontend/middleware.ts`):** no `rewrite`, passar
`request: { headers }` com uma cópia dos headers de entrada acrescida de
`X-Clivra-Proxy-Secret: process.env.CLIVRA_PROXY_SECRET` (prod) /
`CLIVRA_PROXY_SECRET_HML` (preview) e `X-Clivra-Client-Ip: ipAddress(request)`
(de `@vercel/functions`), **sobrescrevendo** o que o cliente tenha mandado
nesses dois nomes. Sem a variável de ambiente ⇒ 503, como já faz hoje.
**Humano, nesta ordem:** gerar o segredo na VPS, cadastrá-lo na Vercel (tipo
*Sensitive*), publicar o front, e só então pôr `PROXY_SECRET` no `.env` da VPS
e reiniciar. O Claude faz a parte da VPS quando pedido.
Depois de ativado: tornar `PROXY_SECRET` obrigatório em produção no
`config.ts` (como o SMTP), para a proteção não sumir em silêncio se a linha
sair do `.env`. A Vercel tem de **sobrescrever** `X-Clivra-Client-Ip` (não
acrescentar). Os rate limits por IP agrupam IPv6 por /64.

### P-17 — Tirar o `refreshToken` do corpo da resposta (Claude)
O front já usa só o cookie. Remover o campo do corpo de `login`/`register`/
`refresh` (contrato v2.0.0) depois que o ChatGPT confirmar que não depende dele.

### Riscos aceitos
- O access token vale até 15 min depois do **logout** (bloqueio, troca de
  senha e "desconectar" já derrubam o access token na hora).
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

1. **Cartões e Categorias:** CRUD de `/v1/cards`; `/v1/categories` com a lista padrão + categorias próprias de cada pessoa (D17).
2. **Lançar compra:** `POST /v1/transactions` (dedupe M4, parcelamento M1),
   `POST /v1/ingest/raw` + parsers Nubank/Itaú, atalho do iOS.
3. **Transações:** listagem com filtros e paginação, edição, estorno (M5), lote.
4. **Pendências:** categorizador (dicionário + Jev), `questions`, `rules`.
5. **Início / Gastos:** `summary`, `summary/months`, `insights`, orçamentos (M3),
   assinaturas (M2), `forecast`.
6. **Ajustes:** Web Push (VAPID), export (M6).
7. **Infra:** backup fora da VPS, P-15, P-17.
