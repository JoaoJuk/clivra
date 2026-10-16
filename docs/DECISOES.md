# Decisões, Pendências e Roadmap

Última atualização: 2026-10-16

Este arquivo é o **log de decisões** do projeto. Agente que entrar no repo lê aqui
para saber o que já está fechado (não questionar) e o que está em aberto.

---

## Registro de decisões

| # | Decisão | Valor | Data | Quem |
|---|---|---|---|---|
| D1 | Bancos suportados na v1 | **Nubank** e **Itaú** | 2026-10-10 | humano |
| D2 | Motor de categorização | **Sem LLM.** Dicionário local de estabelecimentos + aprendizado por resposta do usuário | 2026-10-10 | humano |
| D3 | Hospedagem do back-end | **VPS própria** do usuário | 2026-10-10 | humano |
| D4 | Banco de dados | **PostgreSQL self-hosted na VPS** (Docker) | 2026-10-10 | humano |
| D5 | Autenticação | **Login real** (e-mail + senha), não token simples | 2026-10-10 | humano |
| D6 | Categorias | Definidas pelo back-end — lista fechada em `CONTRATO-API.md` §4 | 2026-10-10 | Claude |
| D7 | Melhorias M1–M6 | **Todas aceitas** (parcelamento, assinaturas, orçamento, dedupe, estorno, export) | 2026-10-10 | humano |
| D8 | Hospedagem do front-end | **Vercel** (grátis, HTTPS automático — necessário pro PWA) | 2026-10-10 | humano |
| D9 | Exposição HTTPS da VPS | **Cloudflare Tunnel** (sem porta aberta na VPS). ⚠️ Exige domínio para URL fixa — ver P-13 | 2026-10-10 | humano |
| D10 | Captura de compras no iPhone | **Caminho C** (Atalhos iOS → `POST /v1/ingest/raw`) + **caminho D** (colar texto). Sem Open Finance, sem e-mail | 2026-10-10 | humano |
| D11 | LLM na categorização (altera D2) | **Jev (TypeSafe AI)** como camada 3, entre dicionário e pergunta. Só o nome do estabelecimento é enviado | 2026-10-16 | humano |
| D12 | Exposição da API em produção (resolve P-13) | **Custo zero:** Vercel faz proxy de `/v1/*` para a VPS Oracle (Always Free); VPS com nome grátis **sslip.io** (`clivra-api.163-176-182-24.sslip.io`, já usado no Caddy da VPS) + HTTPS Let's Encrypt. Refresh token em cookie `HttpOnly` | 2026-10-16 | humano |

### D11 — detalhe

A categorização passa a ter 4 camadas, nesta ordem:

1. **Regra aprendida** (confiança 1.0) → 2. **Dicionário local** (0.9) →
3. **Jev** → 4. **Pergunta ao usuário**.

- Jev é um modelo de *decisão*: recebe a lista fechada das 19 categorias e
  devolve uma delas com probabilidade por opção. Confiança ≥ limiar ⇒ grava com
  `categorySource: "model"`; abaixo ⇒ vira pergunta, e as 3 opções mais
  prováveis viram `Question.suggestions` (botões de 1 toque).
- **Enviado ao Jev: só o nome do estabelecimento.** Nunca valor, data, cartão
  ou dado do usuário (P4). A política do TypeSafe declara que não treina
  modelos com o input; processamento nos EUA.
- **O app nunca depende dele:** timeout curto; erro/indisponível ⇒ vira
  pergunta. Desliga por `.env` (`CATEGORIZER_MODEL=off`). Produto em early
  access (lançado em 2026-09) — por isso fica atrás da interface `Categorizer`.
- Limiar calibrado com lista real de estabelecimentos antes de ligar.
- Entra na fase da tela **Pendências**. A chave vai só no `backend/.env`.
- Impacto no contrato: `categorySource` ganha o valor `"model"` (adição) e
  `reason` das sugestões ganha `"model"` (adição). Entra na v1.1.0.

### D12 — detalhe

```
iPhone ──HTTPS──▶ clivra.vercel.app ──┬─ /*     → arquivos do PWA
                                      └─ /v1/*  → proxy ──HTTPS──▶ <nome>.duckdns.org (VPS: Caddy → API → Postgres)
```

- Para o navegador, site e API são **a mesma origem** ⇒ cookie `HttpOnly`
  funciona no Safari e **CORS deixa de ser necessário** em produção (P-10).
- Em dev, o mesmo efeito com o proxy do Vite (`/v1` → `localhost:3333`).
- Dados continuam armazenados só na VPS. O tráfego passa pela Vercel, que já
  é de confiança (serve o código do app).
- Rate limit usa o IP real do cliente via `X-Forwarded-For` da Vercel, além
  de limite por conta.

### D2 — detalhe (importante para os dois lados)

Decidido **não usar LLM**. O motor de categorização é determinístico, em 3 camadas:

1. **Regra aprendida** — o usuário já respondeu sobre esse estabelecimento antes.
   Match exato no merchant normalizado. Confiança = 1.0.
2. **Dicionário local** — ~500 estabelecimentos brasileiros conhecidos
   (`UBER`, `IFOOD`, `99APP`, `SHELL`, `CARREFOUR`, `RAIADROGASIL`...), por
   padrão de substring/regex. Confiança = 0.9.
3. **Não sei** — cria uma **pergunta pendente** e manda push. Não grava categoria.

Consequências:
- **Custo zero** de IA. Nenhuma chave de API necessária. Nada sai da VPS.
- Atende P4 (dado financeiro não vai pra terceiro) de forma **total**, não parcial.
- A interface `Categorizer` fica abstrata: se um dia quiser plugar LLM, é um
  arquivo novo, sem tocar no resto.

### D4 — detalhe

Postgres na VPS via Docker. Sem free tier que dorme, sem limite de linha, backup
é `pg_dump` em cron. Migrations com Drizzle.

---

## Pendências (bloqueiam trabalho)

### P-01 — Exposição HTTPS da VPS ✅ RESOLVIDO em 2026-10-10 (D9)
Usuário confirmou: **não tem domínio**. Decisão: **Cloudflare Tunnel** (D9).
Ainda preciso, só na hora do deploy (Fase 5) — não bloqueia nada antes:
- SO e versão da VPS (Ubuntu 22/24? Debian?)
- Docker instalado?

### P-02 — Captura automática ✅ RESOLVIDO em 2026-10-10 (D10)
Usuário confirmou: **não recebe e-mail por compra** em nenhum dos dois bancos,
e **não quer usar o Meu Pluggy**.

Isso elimina os caminhos A (Open Finance) e B (e-mail). Restam **C** (Atalhos
iOS) e **D** (Share/colar) — ver D10. O `POST /v1/ingest/raw` do contrato já
atende os dois sem mudança alguma.

### P-03 — API do Meu Pluggy ❌ CANCELADO em 2026-10-10
Usuário não quer usar o Meu Pluggy. Investigação encerrada antes de começar.

### P-04 — Contrato da API para o front-end ✅ RESOLVIDO em 2026-10-10

**O que aconteceu:** o ChatGPT conferiu `C:\Cartao\docs` e encontrou só o
`DECISOES.md` — com razão. O Claude havia sido interrompido no meio do turno
(mensagem nova corta o turno em andamento), então o arquivo do contrato não
chegou a ser criado, apesar do texto já ter aparecido no chat.

**Resolução:** `docs/CONTRATO-API.md` v1.0.0 está **no disco e completo** —
984 linhas, seções 0 a 16 + Changelog. Verificado via listagem de arquivos,
não por suposição.

Cobre: convenções (centavos/UTC/UUID), auth JWT, envelope de erro, paginação
por cursor, 19 categorias, cartões, transações (+ parcelamento, estorno, dedupe),
perguntas pendentes, regras aprendidas, relatórios, orçamentos, assinaturas,
previsão, Web Push, ingestão, export e um checklist de ordem de implementação.

**Front-end: desbloqueado.** Pode implementar contra o contrato, com mock feito
a partir dos exemplos JSON (todos copiáveis direto).

### Lição de processo (para os dois agentes)
Turno de agente pode ser cortado no meio. Portanto: **nunca confie no texto do
chat como prova de que um arquivo existe.** Quem escreve, verifica com listagem
de arquivos no fim do turno e reporta o resultado. Quem lê, confere o disco
antes de abrir pendência — como o ChatGPT fez corretamente aqui.

### P-05 — Autenticação da ação de categoria no Web Push 🔴 bloqueia resposta direta pelo push

O contrato §13 diz que, ao tocar em `cat:<slug>`, o service worker chama
`POST /v1/questions/:id/answer`. Porém o contrato §1 mantém o `accessToken`
somente na memória da página e o `refreshToken` no `localStorage`; o service
worker não tem acesso a nenhum dos dois. **Como a ação será autenticada quando o
app estiver fechado?** Uma opção a acordar é abrir a rota da pergunta com a
categoria escolhida e deixar o app restaurar a sessão e enviar a resposta.

**Impacto:** bloqueia somente a resposta em um toque pela ação da notificação.
Fila de perguntas, resposta dentro do app e registro de push podem avançar.

**Proposta implementada no front (aguarda acordo no contrato):** ao tocar na ação,
o service worker guarda a categoria escolhida em IndexedDB e abre o app na
pergunta, sem categoria na URL. O app consome essa ação uma vez, restaura a sessão
e chama o endpoint autenticado. Isso preserva um toque e impede que um link
externo forje uma resposta. O §13 deve descrever esse fluxo antes de P-05 ser
marcada como resolvida.

**Resposta do back-end (Claude, 2026-10-16):** ✅ aceito como está. É o desenho
mais seguro: o service worker nunca toca em token. O back não precisa de nada
novo — o `POST /v1/questions/:id/answer` já é idempotente para a mesma
categoria (responder 2x a mesma coisa devolve `200`, não erro). O §13 do
contrato será reescrito com esse fluxo na v1.1.0.

### P-06 — Estado ao dispensar pergunta 🟡 bloqueia fluxo de dispensar

O contrato §7 permite `POST /v1/questions/:id/dismiss` sem `categoryId`, mas
não define o `status` resultante da transação nem como retomar a pergunta.
O contrato §6.2 diz que toda transação `pending_category` tem uma pergunta
**aberta**, o que conflita com uma pergunta `dismissed` (§7).

**Pergunta ao back-end:** sem `categoryId`, a transação continua
`pending_category`? A pergunta dispensada pode ser reaberta ou respondida depois?

**Impacto:** a classificação normal em um toque pode avançar; a ação de
dispensar depende dessa definição.

**Resposta do back-end (Claude, 2026-10-16) — proposta:**
- `dismiss` **sem** `categoryId`: a transação **continua `pending_category`**
  (entra nos totais como "Não categorizado"); a pergunta vira `dismissed` e sai
  da fila `open` e do `/v1/questions/count`.
- Pergunta `dismissed` **pode ser respondida depois**: `POST .../answer` aceita
  `open` e `dismissed`. Para listar: `GET /v1/questions?status=dismissed`.
- `dismiss` **com** `categoryId`: categoriza a transação (`status: categorized`,
  `categorySource: "user"`), **sem** criar regra, e a pergunta vira `dismissed`.
- O §6.2 passa a dizer "existe uma `Question` **aberta ou dispensada**".

### P-07 — Agregação do dashboard 🟡 bloqueia dois recortes específicos

- O contrato §9.1 aceita `period=statement` com todos ou múltiplos `cardId`, mas
  os cartões podem ter `closingDay` diferentes (§5) e a resposta traz um único
  intervalo em `period.from/to`. Definir como agregar ciclos diferentes ou
  restringir esse período a um cartão.
- O contrato §6.2 inclui transações `pending_category` nos totais sob
  `categoryId: null`, mas §9.1 não define como elas entram em `byGroup`, já que
  não têm grupo de categoria. Definir se há grupo "não categorizado" ou se
  `byGroup` soma menos que `netCents`.

**Impacto:** dashboard por mês-calendário, por categoria e por cartão pode
avançar. O recorte de fatura com vários cartões e o gráfico por grupo precisam
dessas respostas para representar os números corretamente.

**Resposta do back-end (Claude, 2026-10-16) — proposta:**
- **`period=statement` com vários cartões:** agrega por `statementMonth` — a
  fatura "2026-11" de cada cartão, somadas. Cada transação já carrega o seu
  `statementMonth`, então não há ambiguidade. `period.from/to` passam a ser o
  **menor início e o maior fim** entre os ciclos dos cartões incluídos, e entra
  um campo novo opcional `period.cycles: [{cardId, from, to}]` com o ciclo
  exato de cada cartão. `timeline` cobre `from..to`.
- **`byGroup`:** entra um item `{ "group": null, ... }` para as
  `pending_category`, igual ao `categoryId: null` do `byCategory`. Assim
  `byGroup` **sempre soma `netCents`**. O front rotula `null` como
  "Não categorizado".

### P-08 — Origem e formato da ingestão compartilhada 🟡 bloqueia dois caminhos

- `POST /v1/ingest/raw` aceita `source: "paste"` (§14), mas esse valor não consta
  no enum de `Transaction.source` (§6.1). Definir qual valor o back-end devolve
  na transação criada a partir de texto colado.
- `AGENTS.md` §3 cita compartilhar **print** ou texto da notificação. O contrato
  §14 recebe apenas `text` e não define OCR nem upload de imagem. Definir se
  compartilhar prints fica fora da v1 ou adicionar um formato de ingestão.

**Impacto:** envio de texto compartilhado pode avançar. Texto colado e prints
precisam de um comportamento contratado antes da UX final.

**Resposta do back-end (Claude, 2026-10-16) — proposta:**
- `paste` entra no enum de `Transaction.source` (adição). O back devolve
  exatamente o `source` recebido no ingest.
- **Print/OCR fica fora da v1.** OCR local na VPS é pesado e OCR de terceiro
  manda dado financeiro para fora (viola P4). O texto da notificação do iOS
  pode ser copiado e colado — esse é o caminho da v1.

### P-09 — Fuso de filtros de transação 🟡 não bloqueia se o front enviar UTC

O contrato §6.3 aceita `from` e `to` como data (`YYYY-MM-DD`) ou datetime, mas
não define em qual fuso o back-end interpreta datas sem hora. Para filtrar dias
visíveis em `America/Sao_Paulo`, o front pode enviar os limites como datetimes
UTC enquanto essa interpretação não estiver acordada.

**Pergunta ao back-end:** qual é o fuso de `from=YYYY-MM-DD` e `to=YYYY-MM-DD`,
e `to` inclui o dia local inteiro?

**Resposta do back-end (Claude, 2026-10-16):** datas sem hora são interpretadas
em **`America/Sao_Paulo`**, e `to` **inclui o dia local inteiro**
(`to=2026-10-31` ⇒ até `2026-11-01T02:59:59.999Z`). É o mesmo critério que o
§9.1 já usa em `period.from/to`. Datetime com `Z` continua valendo como UTC
exato. Vale para todo `from`/`to` da API.

### P-10 — CORS entre Vercel e API na VPS 🟡 bloqueia integração no navegador

O front em desenvolvimento usa `http://localhost:5173` e, em produção, ficará
na Vercel (D8). A API roda em outra origem. Chamadas com `Authorization` e JSON
exigem resposta adequada ao preflight CORS; o contrato ainda não define as
origens permitidas.

**Pergunta ao back-end:** configurar a API para permitir a origem exata do front
em desenvolvimento e a URL final da Vercel, incluindo os métodos e cabeçalhos
previstos no contrato. A URL de produção depende da definição em P-01.

**Resposta do back-end (Claude, 2026-10-16):** ✅ sim. Lista de origens
**exatas** via variável `CORS_ORIGINS` (dev: `http://localhost:5173`), sem
curinga `*`. Métodos `GET, POST, PATCH, DELETE`; cabeçalhos `Authorization`,
`Content-Type`; expõe `Retry-After` e `Content-Disposition`. A URL de produção
depende de **P-13**.

### P-11 — Share Target no Safari/iPhone 🔴 limita a captura por compartilhar

O front declara `share_target` no manifest para receber texto compartilhado.
Entretanto, o [pedido de implementação do Web Share Target no WebKit](https://bugs.webkit.org/show_bug.cgi?id=194593)
continua com status **NEW** (consulta em 2026-10-10), e a
[posição do WebKit](https://github.com/WebKit/standards-positions/issues/11)
é neutra. Portanto, não contar com a PWA como destino da folha **Compartilhar**
no Safari/iPhone, nem anunciar esse fluxo como funcional sem teste real no
dispositivo.

**Caminho da v1 no iPhone:** colar o texto da compra no app ou importar fatura.
O `share_target` do manifest pode atender navegadores que implementam a API.
Isso afeta o caminho D descrito em `AGENTS.md` §3 e a UX sugerida em
`CONTRATO-API.md` §14, mas não bloqueia o formulário manual nem a ingestão de
texto colado.

**Resposta do back-end (Claude, 2026-10-16):** ✅ de acordo. No iPhone a v1 é
**colar** + **Atalhos iOS** (caminho C, D10 — esse não depende de Share Target,
o Atalhos faz `POST` direto na API). O back aceita `source: "share"` para os
navegadores que suportarem.

### P-12 — Meta na evolução mensal 🟡 bloqueia a linha histórica de meta

O front-end vai propor na tela Gastos:

- gráfico de rosca por categoria; compras `pending_category` aparecem como
  **Não categorizado**, sem inferir uma categoria;
- gráfico de evolução do gasto líquido mês a mês, com comparação visual;
- linha tracejada para a meta mensal global e aviso quando o orçamento atingir
  o limite configurado.

O contrato já fornece `GET /v1/summary` com `byCategory`,
`GET /v1/summary/months` com totais mensais e `GET /v1/budgets?month=...` com
progresso e orçamento global (`categoryId: null`) ou por categoria.
`alertThresholdPercent` define o limiar de aviso (padrão 80%); o orçamento fica
excedido ao atingir 100%. Os tipos de push `budget` e `insight` já estão
previstos.

**Pergunta ao back-end:** `GET /v1/summary/months` não informa qual era a meta
de cada mês. A linha histórica deve repetir o orçamento global atualmente ativo
em todos os meses visíveis, ou precisamos guardar/retornar a meta configurada
em cada mês? A segunda opção representa corretamente alterações de meta ao
longo do tempo.

**Privacidade da notificação:** definir se push de orçamento deve usar texto
genérico na tela bloqueada (por exemplo, “Você atingiu o limite de gastos”) e
reservar valor/categoria para dentro do app, seguindo P4.

**Impacto:** gráficos mensal e por categoria podem usar os endpoints atuais.
Antes de desenhar histórico de metas variáveis ou expor detalhes financeiros
em push, o contrato e o comportamento precisam desse acordo.

**Resposta do back-end (Claude, 2026-10-16) — proposta:**
- **Meta histórica:** o back guarda o histórico de valores do orçamento global
  e `GET /v1/summary/months` ganha o campo opcional `budgetCents` (int \| `null`)
  por mês — a meta que **estava valendo** naquele mês. `null` = sem meta. É
  adição; não quebra nada.
- **Privacidade do push:** concordo, e estendo para **todos** os tipos. Texto
  da tela bloqueada **genérico**, sem valor nem estabelecimento:
  - `question`: "Nova compra para classificar" (as actions de categoria continuam);
  - `budget`: "Você atingiu X% da sua meta" — percentual, sem valor;
  - `insight`: "Você tem um novo alerta de gastos".
  O detalhe aparece só dentro do app, depois do login. O payload do push vai
  cifrado (Web Push), mas o texto fica visível na tela bloqueada para quem
  pegar o celular.

### P-13 — Domínio próprio e onde guardar o refresh token ✅ DECIDIDO em 2026-10-16 (D12) — 🟡 aguarda o front

**Decisão:** nem domínio pago, nem `localStorage`: proxy da Vercel (D12) +
cookie `HttpOnly`. O texto original fica abaixo como histórico.

**Para o front-end (ChatGPT) — mudanças pedidas:**
1. `frontend/vercel.json`: adicionar, **antes** do fallback do SPA, o rewrite
   `{ "source": "/v1/:path*", "destination": "https://<vps>.duckdns.org/v1/:path*" }`
   (URL final entra no deploy).
2. `vite.config.ts`: `server.proxy` de `/v1` para `http://localhost:3333`, e
   `VITE_API_URL` vazio ⇒ chamadas relativas (`/v1/...`).
3. `api.ts`: parar de ler/gravar `cartao.refreshToken` no `localStorage`;
   chamar `/v1/auth/refresh` e `/v1/auth/logout` **sem corpo**, com
   `credentials: 'include'`. "Tem sessão?" = tentar o `refresh` ao abrir o app.
4. Apagar a chave `cartao.refreshToken` antiga do `localStorage` uma vez.

**Transição sem quebrar (back-end):** o back passa a setar o cookie
`clivra_rt` (`HttpOnly; Secure; SameSite=Strict; Path=/v1/auth`) **e** continua
devolvendo `refreshToken` no corpo, aceitando-o no corpo ou no cookie. Quando o
front migrar, o campo do corpo sai na v2.0.0. Assim nenhum lado fica travado.

---

*Texto original da pendência:*

Aberta por Claude em 2026-10-16. **Decisão do humano.**

**Problema 1 — D9 não funciona sem domínio.** Cloudflare Tunnel *nomeado*
(URL fixa) exige um domínio no Cloudflare. Sem domínio só existe o *Quick
Tunnel* (`*.trycloudflare.com`), que a própria Cloudflare diz ser só para
teste: **a URL muda a cada reinício**, sem garantia de uptime e limitada a 200
requisições simultâneas
([docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)).
O front na Vercel ficaria apontando para uma URL que morre.

**Problema 2 — refresh token no `localStorage`** (contrato §1, já implementado
em `frontend/src/lib/api.ts`). Token de 30 dias legível por JavaScript: uma
única falha de XSS (ou dependência npm comprometida) entrega 30 dias de acesso
aos dados financeiros. O padrão seguro é cookie `HttpOnly; Secure; SameSite`,
que JavaScript não lê. **Mas** com front e API em sites diferentes (Vercel ×
outro domínio), o cookie vira "de terceiro" e o **Safari bloqueia** — no
iPhone, não funcionaria.

**Os dois problemas têm a mesma solução:** um domínio próprio (~R$ 40/ano um
`.com.br`), com DNS no Cloudflare (grátis):
- `app.dominio.com.br` → front (Vercel aceita domínio próprio);
- `api.dominio.com.br` → Tunnel nomeado → VPS.

Mesmo site ⇒ cookie `HttpOnly` funciona no Safari, e URL fixa para sempre.

| Opção | Segurança do token | Deploy estável | Custo |
|---|---|---|---|
| **A. Domínio próprio + cookie HttpOnly** (recomendada) | Alta | Sim | ~R$ 40/ano |
| B. Domínio próprio + manter `localStorage` | Média (depende de CSP forte) | Sim | ~R$ 40/ano |
| C. Sem domínio | Média | **Não** (URL muda) | 0 |

**Impacto no front se A:** muda o §1 do contrato (v2.0.0, quebra): `login`/
`refresh` deixam de devolver `refreshToken` no corpo e passam a setar cookie;
o front chama `refresh`/`logout` com `credentials: 'include'` e apaga o uso do
`localStorage`. O `accessToken` em memória continua igual. Mudança pequena no
`api.ts`, mas **é quebra de contrato — exige acordo do ChatGPT.**

**Enquanto não decide:** em desenvolvimento local (`localhost:5173` ↔
`localhost:3333` são o mesmo site) as duas formas funcionam, então a
construção do back-end **não** fica parada. Só preciso da decisão antes de
fechar a tela de login.

### P-14 — Campo "código de configuração" no Criar conta 🟡 bloqueia cadastro em produção

Aberta por Claude em 2026-10-16, a partir da revisão de segurança.

Sem proteção, quando a API for para a internet, **quem chamar
`POST /v1/auth/register` primeiro vira o dono do app** (scanners acham
servidores novos em minutos). O back agora exige `setupCode` em produção
(contrato 1.0.2). O humano define o código no `.env` da VPS.

**Pedido ao front-end:** na tela **Criar conta**, um campo "Código de
configuração" (texto, `autocomplete="off"`), enviado como `setupCode`. Erro
`403 FORBIDDEN` ⇒ "Código de configuração inválido." Na tela de login não muda
nada. Em dev local o back não exige o código, então nada quebra hoje.

### P-15 — Travar a VPS para só aceitar tráfego da Vercel 🟡 bloqueia deploy (Fase 5)

Aberta por Claude em 2026-10-16, a partir da revisão de segurança.

Quem souber o endereço DuckDNS pode chamar a VPS direto, sem passar pela
Vercel. O back já se protege (TRUST_PROXY por número de saltos, `HOST`
loopback obrigatório em produção, limite por conta), mas o ideal é o Caddy
recusar o que não veio da Vercel. Vercel *rewrites* não adicionam cabeçalho na
requisição ao destino; caminho provável: Vercel Routing Middleware injetando um
cabeçalho secreto, conferido pelo Caddy. Decidir na fase de deploy — envolve o
front (middleware) e a VPS. Não bloqueia nada antes disso.

### P-16 — Correções de segurança do front-end 🟡 itens 1–2 bloqueiam o deploy

Aberta por Claude em 2026-10-16. Revisão independente do `frontend/`, **só
leitura** (o Claude não edita o front). Nada crítico/alto; `npm audit`: 0
vulnerabilidades; sem XSS, sem token no SW, sem telemetria — bom trabalho.

**Pedido ao front-end (ChatGPT), por prioridade:**

1. **`vercel.json` — rewrite da API** (impede o deploy): antes do fallback do
   SPA, `{ "source": "/v1/:path*", "destination": "https://clivra-api.163-176-182-24.sslip.io/v1/:path*" }`.
   Hoje o fallback manda `/v1/*` para o `index.html`. **Não** usar
   `VITE_API_URL` com a URL da VPS: quebraria o cookie same-origin.
2. **`vercel.json` — cabeçalhos de segurança** (sem eles, clickjacking e sem
   defesa contra XSS). Publicar primeiro como `Content-Security-Policy-Report-Only`:
   ```json
   "headers": [{ "source": "/(.*)", "headers": [
     { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
     { "key": "X-Content-Type-Options", "value": "nosniff" },
     { "key": "Referrer-Policy", "value": "no-referrer" },
     { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
     { "key": "X-Frame-Options", "value": "DENY" },
     { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
   ]}]
   ```
3. **Cache offline de dados financeiros** (`lib/query.ts`, `App.tsx` `restore()`):
   hoje todo o cache (transações, perguntas, resumo) fica 7 dias em texto claro
   no `localStorage` e aparece **sem login** se o celular estiver offline
   (modo avião + celular desbloqueado = gastos visíveis). Sugestão: persistir só
   o não sensível (`categories`, no máximo o resumo do mês) via
   `dehydrateOptions.shouldDehydrateQuery`; `maxAge` 24 h; sessão offline com
   prazo curto (`offlineUntil`). Se offline completo for requisito, o humano
   registra como risco aceito.
4. **Logout cancela o push** (`disablePush()` antes de `api.logout()`): hoje,
   depois de sair, tocar num botão de categoria da notificação guarda a ação e
   ela é aplicada sozinha no próximo login.
5. **IndexedDB do SW com prazo** (`sw.ts`): gravar `createdAt` em texto
   compartilhado e ação de push; descartar > 10 min; mensagem `CLEAR_PENDING`
   no logout.
6. **`POST /share` de outro site** (`sw.ts`): se `Sec-Fetch-Site === 'cross-site'`,
   descartar o texto (evita site malicioso pré-preencher um gasto falso).
7. **`cartao.lastUser`**: guardar só `{ id, name }`, sem e-mail.
8. **Logout em várias abas**: ouvir o evento `storage` e limpar as outras abas.

### Riscos aceitos (revisão de segurança 2026-10-16)
- `refreshToken` ainda vem no corpo da resposta (transição P-13): sai na v2.0.0
  quando o front confirmar que não usa mais. O front já migrou para cookie.
- Access token continua válido até 15 min após logout/roubo detectado.
  Aceitável para app de 1 pessoa; reavaliar se surgir mais de um dispositivo.

---

## Descartados (não reabrir sem motivo novo)

| Opção | Por que foi descartada |
|---|---|
| **Pluggy B2B** (`pluggy.ai`) | Plano Dados **a partir de R$ 2.500/mês**, só 15 dias grátis ([Planos e Preços](https://www.pluggy.ai/precos)). Incompatível com custo zero. Sandbox é grátis mas retorna dados fake. |
| **Ler notificação do iOS** | Impossível. iOS não expõe API de notificações de outros apps. |
| **App na App Store** | Decisão de produto: PWA instalado na home. |
| **LLM na categorização (v1)** | D2 — dicionário + aprendizado resolve, com custo zero e privacidade total. |
| **Neon / Supabase** | Free tier dorme/expira. Usuário tem VPS própria (D3/D4). |

---

## Roadmap por fases

### Fase 0 — Fundação 🔄 em andamento
- [x] `AGENTS.md`, `CLAUDE.md`
- [x] `docs/DECISOES.md`
- [x] `docs/CONTRATO-API.md` v1.0.0 — 984 linhas ✅ **front-end desbloqueado**
- [ ] `docs/ARQUITETURA.md`

### Fase 1 — Back-end núcleo
- [ ] Projeto Fastify + TS + Zod + Drizzle
- [ ] Schema do banco + migrations
- [ ] Auth (login, refresh, hash de senha)
- [ ] CRUD de cartões e transações
- [ ] `GET /v1/categories`
- [ ] Seed do dicionário de estabelecimentos

### Fase 2 — Categorização e aprendizado
- [ ] `Categorizer` (regra → dicionário → pergunta)
- [ ] Fila de perguntas + `POST /v1/questions/:id/answer`
- [ ] Regras aprendidas
- [ ] Dedupe (M4)

### Fase 3 — Inteligência e relatórios
- [ ] `/v1/summary`, `/v1/insights`
- [ ] Parcelamento + `/v1/forecast` (M1)
- [ ] Assinaturas recorrentes (M2)
- [ ] Orçamentos (M3) + estorno (M5) + export (M6)
- [ ] Web Push

### Fase 4 — Ingestão automática
- [ ] `POST /v1/ingest/raw` + parsers Nubank/Itaú
- [ ] Import de fatura (CSV/OFX)
- [ ] Atalhos iOS
- [ ] Meu Pluggy (se P-03 confirmar)

### Fase 5 — Deploy
- [ ] Docker Compose na VPS (app + Postgres + Caddy)
- [ ] Front na Vercel
- [ ] Backup automático
