# CONTRATO DA API — v1

**Versão:** 1.0.5 · **Data:** 2026-10-19 · **Status:** ✅ ESTÁVEL — o front-end pode implementar contra isto.

> Este arquivo é o **contrato** entre back-end (Claude) e front-end (ChatGPT).
> Nenhum lado adivinha nada. Mudança que quebra compatibilidade exige acordo dos
> dois lados e entra no `## Changelog` no fim.
>
> **Front-end:** tudo aqui é suficiente para construir o app inteiro com mock.
> Se algo que você precisa não estiver aqui, escreva em `docs/DECISOES.md`
> §Pendências — não invente.

---

## 0. Convenções gerais

| Item | Regra |
|---|---|
| **Base URL (dev)** | `http://localhost:3333` |
| **Base URL (prod)** | `https://<dominio-da-vps>` — a definir (P-01) |
| **Prefixo** | Todas as rotas sob `/v1` |
| **Content-Type** | `application/json; charset=utf-8` |
| **Dinheiro** | `amountCents`: inteiro em **centavos**. `1234` = R$ 12,34. Nunca float. |
| **Sinal do valor** | **Positivo = gasto.** **Negativo = estorno/crédito.** Somar a coluna dá o gasto líquido. |
| **Moeda** | Campo separado `currency`, sempre `"BRL"` na v1 |
| **Datas** | ISO 8601 **em UTC**, com `Z`: `"2026-10-10T14:32:00Z"`. Exibir em `America/Sao_Paulo` é tarefa do front. |
| **Datas sem hora** | `"YYYY-MM-DD"` (ex.: vencimento de fatura, mês de referência) |
| **IDs** | UUID v7 em string |
| **Slugs** | `categoryId` é slug estável em `snake_case` (ex.: `"mercado"`), **não** UUID |
| **Campo ausente** | Omitido ou `null` — o front deve tratar os dois igual |

### Formato de resposta

**Recurso único** → o objeto, direto:
```json
{ "id": "018f...", "amountCents": 4590 }
```

**Lista** → sempre envelopado com paginação:
```json
{
  "data": [ { "id": "018f..." } ],
  "page": { "nextCursor": "eyJpZCI6...", "hasMore": true, "total": 243 }
}
```
- `total` é **opcional** (pode vir `null` em listas grandes). Não dependa dele.

---

## 1. Autenticação

JWT Bearer. Access token curto + refresh token longo.

| Token | Validade | Onde guardar |
|---|---|---|
| `accessToken` | **15 minutos** | memória / variável (não localStorage) |
| `refreshToken` | **30 dias** | `localStorage` (é PWA de 1 usuário) |

Toda rota — exceto as de `/v1/auth/*` (menos `me`) e `/v1/health` — exige:
```
Authorization: Bearer <accessToken>
```

### Família: admin e convites (1.0.4)
- A **primeira conta** do app vira `role: "admin"` e exige `setupCode`.
- Depois dela, **só e-mail convidado pelo admin** cria conta
  (`role: "member"`), sempre com `emailCode`. Convite vale 7 dias.
- Cada usuário só vê os próprios dados: toda rota de recurso filtra pelo
  usuário do token. O admin **não** vê dados financeiros dos outros (§17).
- Conta bloqueada pelo admin: o login responde `403 FORBIDDEN` (só depois da
  senha certa) e qualquer token dela passa a dar `401` **na hora**.

### `GET /v1/auth/registration` (adição 1.0.4)
Pública. Diz qual tela de cadastro mostrar.
Response `200`: `{ "mode": "owner_setup" }` (ninguém cadastrado: mostrar o
campo **Código de configuração**) ou `{ "mode": "invite_only" }` (esconder o
campo; explicar que é preciso convite do admin).

### `POST /v1/auth/register`
Cria o admin (primeira conta) ou um familiar convidado.

Request:
```json
{ "email": "voce@exemplo.com", "password": "minhasenha123", "name": "João", "setupCode": "..." }
```
- `password`: mínimo **8** caracteres.
- `name`: obrigatório, 1–80 caracteres.
- `setupCode` (adição 1.0.2): código de configuração definido no servidor.
  **Obrigatório em produção** — impede que um estranho crie a conta antes do
  dono. Ausente/errado ⇒ `403 FORBIDDEN`. Em dev local pode não ser exigido.
- `emailCode` (adição 1.0.3): código de 6 dígitos recebido por e-mail
  (`POST /v1/auth/email-code` com `purpose: "register"`). **Obrigatório quando
  o servidor envia e-mail** (produção); sem e-mail configurado, é ignorado.
  Ausente/malformado/errado/expirado ⇒ `400 INVALID_EMAIL_CODE`.
- Primeira conta — ordem das checagens: `FORBIDDEN` (setupCode) →
  `INVALID_EMAIL_CODE`. Dois cadastros de admin ao mesmo tempo: o segundo
  leva `403 REGISTRATION_CLOSED`.
- Depois do admin: `setupCode` é ignorado. E-mail sem convite ativo ⇒
  `400 INVALID_EMAIL_CODE` (o código nunca foi enviado) — vale também para
  e-mail que já tem conta, para não revelar quem está cadastrado (`409
  CONFLICT` só numa corrida rara). Servidor sem e-mail ⇒ `403 REGISTRATION_CLOSED`.

Response `201`: igual ao do login.

**Fluxo da tela Criar conta (1.0.3):** (1) usuário preenche nome, e-mail,
senha e código de configuração → `POST /v1/auth/email-code`; (2) a tela pede
o código de 6 dígitos → `POST /v1/auth/register` com tudo + `emailCode`.

### `POST /v1/auth/email-code` (adição 1.0.3)
Envia um código de **6 dígitos** por e-mail. Vale **10 min** e **uma vez só**.
Pedir outro **não** invalida o anterior: qualquer código ainda válido serve, e
usar um encerra os demais.

Request:
```json
{ "email": "voce@exemplo.com", "purpose": "register", "setupCode": "..." }
```
- `purpose`: `"register"` (Criar conta) ou `"password_reset"` (Esqueci a senha).
- `setupCode`: obrigatório com `purpose: "register"` em produção (mesmas
  regras do `register`: `403 FORBIDDEN` / `403 REGISTRATION_CLOSED`).

Response `202`:
```json
{ "expiresIn": 600, "resendIn": 60 }
```
- `resendIn`: segundos até poder pedir outro. Pedido antes disso (ou acima de
  5 por dia) devolve o **mesmo `202` sem enviar nada** — o front mostra uma
  contagem regressiva no botão "Reenviar código".
- Com `password_reset`, a resposta é **sempre `202`**, exista ou não conta com
  esse e-mail (não revela quem está cadastrado). Conta bloqueada não recebe.
- Com `register` depois do admin, também **sempre `202`**: o código só é
  enviado se o e-mail tiver convite ativo (não revela quem foi convidado).
- Servidor sem e-mail configurado ⇒ `503 SERVICE_UNAVAILABLE`.
- Rate limit: 5 por 15 min por IP.

### `POST /v1/auth/password-reset` (adição 1.0.3)
Troca a senha com o código recebido (`purpose: "password_reset"`).

Request:
```json
{ "email": "voce@exemplo.com", "emailCode": "123456", "newPassword": "novasenha123" }
```
Response `204`. **Todas as sessões são encerradas** (inclusive a deste
aparelho — o cookie é apagado): o front manda para o login. Um `accessToken`
já emitido ainda vale até expirar (no máximo 15 min), como no logout.
- Código malformado/errado/expirado/já usado, ou 5 tentativas erradas ⇒ `400 INVALID_EMAIL_CODE`.
- `newPassword`: mínimo 8 caracteres.
- Servidor sem e-mail configurado ⇒ `503 SERVICE_UNAVAILABLE`.
- Rate limit: 10 por 15 min por IP.

### `POST /v1/auth/login`
Request:
```json
{ "email": "voce@exemplo.com", "password": "minhasenha123" }
```
Response `200`:
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "expiresIn": 900,
  "user": { "id": "018f...", "email": "voce@exemplo.com", "name": "João", "role": "admin" }
}
```
- `expiresIn`: segundos até o `accessToken` expirar.
- `user.role` (adição 1.0.4): `"admin"` ou `"member"`. Só o admin vê o
  painel de família (§17).
- Credencial errada → `401 INVALID_CREDENTIALS`.
- Conta bloqueada (senha certa) → `403 FORBIDDEN`.

> **Adição 1.0.1 (retrocompatível):** `register`, `login` e `refresh` também
> gravam o refresh token no cookie `clivra_rt` (`HttpOnly; SameSite=Strict;
> Path=/v1/auth`). `refresh` e `logout` aceitam o token **no corpo ou no
> cookie** — corpo vazio é permitido. Hoje nada muda para o front; é a base da
> migração para cookie acordada em `DECISOES.md` P-13 / D12.

### `POST /v1/auth/refresh`
Request: `{ "refreshToken": "eyJ..." }`
Response `200`: mesmo formato do login (**rotaciona** o refresh — guarde o novo).
Refresh inválido/expirado → `401 INVALID_REFRESH_TOKEN` ⇒ front manda pro login.

### `POST /v1/auth/logout`
Request: `{ "refreshToken": "eyJ..." }` → Response `204`. Invalida o refresh.

> **1.0.5:** em `refresh` e `logout`, token **vindo do cookie** com
> `Sec-Fetch-Site: cross-site` ou `same-site` ⇒ `403 FORBIDDEN` (CSRF). O PWA
> chama de `same-origin`, então nada muda. `logout` tem limite de 30/15 min.

### `GET /v1/auth/me`
Response `200`:
```json
{ "id": "018f...", "email": "voce@exemplo.com", "name": "João", "role": "admin", "createdAt": "2026-10-10T12:00:00Z" }
```

### `GET /v1/health`
Pública, sem auth. `200` → `{ "status": "ok", "version": "1.0.0" }`.
Use para o indicador de online/offline.

---

## 2. Envelope de erro

**Todo** erro tem exatamente esta forma. Nunca vaza stack trace.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "O campo amountCents deve ser um inteiro positivo.",
    "details": [ { "field": "amountCents", "issue": "expected integer, received string" } ],
    "requestId": "018f2c3d-..."
  }
}
```
- `message` é em **português** e pode ser mostrado ao usuário.
- `details` é opcional (presente em erro de validação).
- `requestId` serve para correlacionar com o log do servidor.

### Códigos

| HTTP | `code` | Significado / ação do front |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload inválido. Mostrar `details` no formulário. |
| 400 | `INVALID_EMAIL_CODE` | Código do e-mail errado, expirado ou já usado. Oferecer "Reenviar código". |
| 401 | `UNAUTHENTICATED` | Sem token / token expirado. **Tentar refresh, depois login.** |
| 401 | `INVALID_CREDENTIALS` | E-mail ou senha errados. |
| 401 | `INVALID_REFRESH_TOKEN` | Ir para o login. |
| 403 | `FORBIDDEN` | Sem permissão (inclui conta bloqueada, pedido de outro site no `refresh`/`logout` e acesso direto à API sem passar pelo proxy da Vercel — P-15). O front mostra a `message`. |
| 403 | `REGISTRATION_CLOSED` | Cadastro fechado (corrida de dois admins, servidor sem e-mail, ou produção sem código de configuração). |
| 404 | `NOT_FOUND` | Recurso inexistente. |
| 409 | `CONFLICT` | Conflito genérico (ex.: e-mail já existe). |
| 409 | `DUPLICATE_TRANSACTION` | Transação já existe (dedupe). Ver §6.3. |
| 422 | `UNPROCESSABLE` | Válido sintaticamente, impossível semanticamente. |
| 429 | `RATE_LIMITED` | Header `Retry-After` em segundos. |
| 500 | `INTERNAL_ERROR` | Erro nosso. Mostrar "tente de novo". |
| 503 | `SERVICE_UNAVAILABLE` | Banco fora / manutenção / envio de e-mail não configurado. |

---

## 3. Paginação, ordenação e filtros

**Cursor-based** (estável mesmo inserindo dados novos).

Query params comuns a todas as listas:

| Param | Tipo | Default | Nota |
|---|---|---|---|
| `limit` | int 1–100 | `50` | |
| `cursor` | string | — | Passe o `page.nextCursor` da resposta anterior |
| `order` | `asc` \| `desc` | `desc` | Por data da transação |

Quando `page.hasMore` for `false`, acabou. `nextCursor` vem `null`.

---

## 4. Categorias

Lista **fechada e fixa** na v1, definida pelo back-end (D6). O front deve
**buscar** em runtime e nunca hardcodar — mas pode cachear agressivamente
(muda raramente).

### `GET /v1/categories`
Response `200` (não paginado — retorna tudo):
```json
{
  "data": [
    { "id": "mercado",      "name": "Mercado",            "icon": "🛒", "color": "#16a34a", "group": "essencial" },
    { "id": "restaurante",  "name": "Restaurante",        "icon": "🍽️", "color": "#ea580c", "group": "variavel" },
    { "id": "delivery",     "name": "Delivery",           "icon": "🛵", "color": "#f97316", "group": "variavel" },
    { "id": "transporte",   "name": "Transporte",         "icon": "🚕", "color": "#0ea5e9", "group": "essencial" },
    { "id": "combustivel",  "name": "Combustível",        "icon": "⛽", "color": "#0284c7", "group": "essencial" },
    { "id": "saude",        "name": "Saúde",              "icon": "🏥", "color": "#dc2626", "group": "essencial" },
    { "id": "farmacia",     "name": "Farmácia",           "icon": "💊", "color": "#e11d48", "group": "essencial" },
    { "id": "casa",         "name": "Casa",               "icon": "🏠", "color": "#7c3aed", "group": "fixo" },
    { "id": "contas",       "name": "Contas e Utilidades","icon": "💡", "color": "#8b5cf6", "group": "fixo" },
    { "id": "assinaturas",  "name": "Assinaturas",        "icon": "🔄", "color": "#a855f7", "group": "fixo" },
    { "id": "compras",      "name": "Compras",            "icon": "🛍️", "color": "#db2777", "group": "variavel" },
    { "id": "lazer",        "name": "Lazer",       "icon": "🎬", "color": "#f59e0b", "group": "variavel" },
    { "id": "viagem",       "name": "Viagem",             "icon": "✈️", "color": "#06b6d4", "group": "variavel" },
    { "id": "educacao",     "name": "Educação",           "icon": "📚", "color": "#2563eb", "group": "fixo" },
    { "id": "servicos",     "name": "Serviços",           "icon": "🔧", "color": "#64748b", "group": "variavel" },
    { "id": "pets",         "name": "Pets",               "icon": "🐾", "color": "#84cc16", "group": "variavel" },
    { "id": "taxas",        "name": "Taxas e Tarifas",    "icon": "🏦", "color": "#475569", "group": "financeiro" },
    { "id": "saque",        "name": "Saque",              "icon": "💵", "color": "#334155", "group": "financeiro" },
    { "id": "outros",       "name": "Outros",             "icon": "❓", "color": "#94a3b8", "group": "variavel" }
  ]
}
```

- `group` ∈ `"essencial" | "fixo" | "variavel" | "financeiro"` — use para agrupar
  no dashboard (ex.: "quanto é gasto fixo vs. variável").
- `color` é hex pronto para usar em gráfico.
- `"outros"` é o fallback quando o usuário escolhe "não sei classificar".

---

## 5. Cartões

### Objeto `Card`
```json
{
  "id": "018f1111-...",
  "name": "Nubank Roxinho",
  "bank": "nubank",
  "brand": "mastercard",
  "lastFourDigits": "1234",
  "type": "credit",
  "color": "#820ad1",
  "closingDay": 28,
  "dueDay": 5,
  "limitCents": 500000,
  "archived": false,
  "createdAt": "2026-10-10T12:00:00Z"
}
```

| Campo | Tipo | Nota |
|---|---|---|
| `bank` | `"nubank"` \| `"itau"` \| `"other"` | Lista cresce sem quebrar — trate desconhecido como `other` |
| `brand` | `"visa"` \| `"mastercard"` \| `"elo"` \| `"amex"` \| `"hipercard"` \| `"other"` | |
| `type` | `"credit"` \| `"debit"` | |
| `lastFourDigits` | string 4 dígitos \| `null` | |
| `closingDay` | 1–31 \| `null` | Dia de fechamento da fatura. Só `credit`. |
| `dueDay` | 1–31 \| `null` | Dia de vencimento. Só `credit`. |
| `limitCents` | int \| `null` | Limite total |
| `archived` | bool | Cartão inativo. Não aparece em seletor, mas o histórico continua. |

### `GET /v1/cards`
Query: `includeArchived` (bool, default `false`).
Response `200`: `{ "data": [Card], "page": {...} }`

### `POST /v1/cards`
Request (só `name` e `bank` obrigatórios):
```json
{ "name": "Nubank Roxinho", "bank": "nubank", "brand": "mastercard",
  "lastFourDigits": "1234", "type": "credit", "color": "#820ad1",
  "closingDay": 28, "dueDay": 5, "limitCents": 500000 }
```
Response `201`: `Card`

### `GET /v1/cards/:id` → `200` `Card`
### `PATCH /v1/cards/:id`
Qualquer subconjunto dos campos de criação + `archived`. Response `200` `Card`.
### `DELETE /v1/cards/:id`
Response `204`. **Só** se não tiver transação. Se tiver →
`409 CONFLICT` (use `PATCH {archived:true}`).

---

## 6. Transações

### 6.1 Objeto `Transaction`
```json
{
  "id": "018f2222-...",
  "cardId": "018f1111-...",
  "amountCents": 4590,
  "currency": "BRL",
  "merchantRaw": "PAG*JL2201 SAO PAULO BR",
  "merchantName": "Padaria JL",
  "description": null,
  "categoryId": "mercado",
  "categorySource": "learned_rule",
  "confidence": 1,
  "status": "categorized",
  "occurredAt": "2026-10-09T18:22:00Z",
  "postedAt": "2026-10-10T03:00:00Z",
  "source": "manual",
  "installment": null,
  "refundOfTransactionId": null,
  "isRecurring": false,
  "recurringGroupId": null,
  "statementMonth": "2026-11",
  "tags": [],
  "notes": null,
  "createdAt": "2026-10-10T12:00:00Z",
  "updatedAt": "2026-10-10T12:00:00Z"
}
```

| Campo | Tipo | Nota |
|---|---|---|
| `amountCents` | int | **Positivo = gasto. Negativo = estorno.** |
| `merchantRaw` | string | Texto cru do banco. Mostre só em "detalhes". |
| `merchantName` | string \| `null` | Nome limpo/amigável. **Prefira este na UI**, com fallback pro `merchantRaw`. |
| `description` | string \| `null` | Texto livre do usuário |
| `categoryId` | slug \| `null` | `null` ⇒ ainda não categorizada |
| `categorySource` | enum | De onde veio a categoria — ver abaixo |
| `confidence` | number 0–1 \| `null` | |
| `status` | enum | Ver 6.2 |
| `occurredAt` | datetime UTC | **Quando a compra aconteceu. Use este para ordenar/filtrar.** |
| `postedAt` | datetime UTC \| `null` | Quando o banco efetivou |
| `source` | enum | `manual` \| `share` \| `email` \| `shortcut` \| `openfinance` \| `import` |
| `installment` | objeto \| `null` | Parcelamento — ver 6.4 |
| `refundOfTransactionId` | uuid \| `null` | Se é estorno, aponta pra original (M5) |
| `isRecurring` | bool | Detectado como assinatura (M2) |
| `recurringGroupId` | uuid \| `null` | Agrupa as ocorrências da mesma assinatura |
| `statementMonth` | `"YYYY-MM"` \| `null` | Fatura em que cai (calculado via `closingDay`). **Use para "gasto da fatura"**, diferente de mês-calendário. |
| `tags` | string[] | Livre, pelo usuário |
| `notes` | string \| `null` | |

**`categorySource`:**
| Valor | Significado | `confidence` |
|---|---|---|
| `learned_rule` | Usuário já ensinou esse estabelecimento | `1` |
| `dictionary` | Dicionário interno de estabelecimentos BR | `~0.9` |
| `user` | Usuário escolheu/corrigiu manualmente | `1` |
| `inherited_installment` | Herdado da 1ª parcela | `1` |
| `unknown` | Não identificado ⇒ virou pergunta | `null` |

### 6.2 `status` — máquina de estados
| Valor | Significado | UI sugerida |
|---|---|---|
| `pending_category` | Não sabemos a categoria. **Existe uma `Question` aberta.** | Badge laranja "classificar" |
| `categorized` | Tem categoria. Estado normal. | Normal |
| `ignored` | Usuário marcou para **não contar** nos totais | Cinza/riscado |
| `refunded` | Foi estornada; existe transação negativa ligada | Riscado |

> **Importante:** `/v1/summary` e `/v1/insights` **excluem** `ignored`.
> `pending_category` **entra** nos totais (o valor é conhecido, só falta a
> categoria) e aparece agregada sob `categoryId: null`.

### 6.3 `GET /v1/transactions`
Query params (todos opcionais, combináveis):

| Param | Tipo | Exemplo | Nota |
|---|---|---|---|
| `from` | date/datetime | `2026-10-01` | `occurredAt >= from` |
| `to` | date/datetime | `2026-10-31` | `occurredAt <= to` (inclusivo) |
| `cardId` | uuid \| csv | `018f...,018f...` | |
| `categoryId` | slug \| csv | `mercado,delivery` | Use `none` para não-categorizadas |
| `status` | enum \| csv | `pending_category` | |
| `statementMonth` | `YYYY-MM` | `2026-11` | Filtra por fatura |
| `search` | string | `uber` | Busca em `merchantRaw`/`merchantName`/`notes` |
| `minCents` / `maxCents` | int | `1000` | |
| `isRecurring` | bool | `true` | |
| `tags` | csv | `viagem-sp` | |
| `limit`/`cursor`/`order` | — | — | Ver §3 |

Response `200`:
```json
{
  "data": [ /* Transaction */ ],
  "page": { "nextCursor": "eyJ...", "hasMore": true, "total": 243 },
  "summary": { "totalCents": 184530, "count": 243 }
}
```
- `summary` reflete **o filtro aplicado inteiro** (não só a página atual).
  Ótimo para o cabeçalho "Outubro: R$ 1.845,30".

### `POST /v1/transactions` — lançamento manual
```json
{
  "cardId": "018f1111-...",
  "amountCents": 4590,
  "merchantRaw": "Padaria JL",
  "occurredAt": "2026-10-09T18:22:00Z",
  "categoryId": "mercado",
  "notes": "pão de queijo",
  "installment": { "number": 1, "total": 3 }
}
```
Obrigatórios: `cardId`, `amountCents`, `merchantRaw`, `occurredAt`.
- Se **omitir** `categoryId`, o back roda a categorização. Pode voltar
  `status: "pending_category"` + uma `Question` nova.
- `installment` opcional; se presente, o back cria as parcelas futuras (6.4).

Response `201`:
```json
{
  "transaction": { /* Transaction */ },
  "question": { /* Question ou null */ }
}
```
> **Atenção front:** este endpoint retorna um objeto com `transaction` e
> `question`, **não** a transação direto. Se `question != null`, você pode abrir
> o seletor de categoria na hora, sem esperar o push.

**Dedupe (M4):** se já existir transação com mesmo `cardId` + `amountCents` +
`merchantRaw` normalizado dentro de **±90 minutos** de `occurredAt`, retorna
`409 DUPLICATE_TRANSACTION` com a existente em `details`:
```json
{ "error": { "code": "DUPLICATE_TRANSACTION", "message": "Esta transação já foi registrada.",
  "details": [ { "field": "existingTransactionId", "issue": "018f3333-..." } ],
  "requestId": "018f..." } }
```
Para forçar mesmo assim (comprei 2x o mesmo café), envie `?force=true`.

### `GET /v1/transactions/:id` → `200` `Transaction`

### `PATCH /v1/transactions/:id`
Campos editáveis: `cardId`, `amountCents`, `merchantName`, `description`,
`categoryId`, `occurredAt`, `status`, `tags`, `notes`.

```json
{ "categoryId": "delivery", "learnRule": true }
```
- **`learnRule`** (bool, default `true`): ao mudar `categoryId`, cria/atualiza a
  regra aprendida para aquele estabelecimento (P2 — perguntar uma vez só).
  Mande `false` para uma correção pontual que **não** deve virar regra.
- Mudar `categoryId` seta `categorySource: "user"` e `status: "categorized"`.

Response `200` `Transaction`.

### `DELETE /v1/transactions/:id` → `204`

### `POST /v1/transactions/:id/refund` — estorno (M5)
Cria a transação negativa vinculada e marca a original como `refunded`.
```json
{ "amountCents": 4590, "occurredAt": "2026-10-12T10:00:00Z" }
```
- `amountCents`: valor **positivo** do que foi estornado (parcial permitido);
  o back grava negativo. Omitido ⇒ estorno total.

Response `201`:
```json
{ "refund": { /* Transaction com amountCents negativo */ },
  "original": { /* Transaction com status refunded */ } }
```

### `POST /v1/transactions/bulk-categorize`
Classifica várias de uma vez (útil depois de um import).
```json
{ "transactionIds": ["018f...", "018f..."], "categoryId": "mercado", "learnRule": true }
```
Response `200`: `{ "updated": 12, "transactions": [ /* Transaction */ ] }`

### 6.4 Parcelamento (M1)
```json
"installment": {
  "number": 2,
  "total": 12,
  "groupId": "018f4444-...",
  "totalAmountCents": 120000
}
```
- `number`/`total`: "2 de 12".
- `groupId`: mesmo valor em todas as 12 parcelas.
- `totalAmountCents`: valor da compra inteira.
- Cada parcela é uma `Transaction` própria, com `occurredAt` no mês dela e
  `statementMonth` correspondente. Parcelas futuras nascem
  `categorySource: "inherited_installment"`.
- Exibição sugerida: `"Notebook (2/12)"`.

### `GET /v1/transactions/:id/installments`
Todas as parcelas do mesmo grupo.
Response `200`: `{ "data": [Transaction], "groupId": "018f...", "totalAmountCents": 120000, "paidCount": 2, "remainingCents": 100000 }`

---

## 7. Perguntas pendentes (o coração do P1/P2)

### Objeto `Question`
```json
{
  "id": "018f5555-...",
  "transactionId": "018f2222-...",
  "merchantRaw": "PAG*JL2201 SAO PAULO BR",
  "merchantNameGuess": "PAG JL2201",
  "amountCents": 4590,
  "occurredAt": "2026-10-09T18:22:00Z",
  "cardId": "018f1111-...",
  "cardName": "Nubank Roxinho",
  "suggestions": [
    { "categoryId": "mercado",     "confidence": 0.42, "reason": "similar_merchant" },
    { "categoryId": "restaurante", "confidence": 0.31, "reason": "similar_merchant" },
    { "categoryId": "delivery",    "confidence": 0.12, "reason": "frequency" }
  ],
  "occurrenceCount": 3,
  "status": "open",
  "createdAt": "2026-10-10T12:00:00Z",
  "answeredAt": null
}
```
| Campo | Nota |
|---|---|
| `suggestions` | 0–3 itens, ordenados por `confidence` desc. **Pode vir vazio.** Renderize como atalhos de 1 toque e sempre ofereça "ver todas as categorias". |
| `reason` | `similar_merchant` \| `frequency` \| `amount_pattern` \| `category_history` — pode mostrar como dica ("parecido com compras anteriores") |
| `occurrenceCount` | Quantas transações pendentes têm **esse mesmo** estabelecimento. `3` ⇒ "responder isso resolve 3 compras". |
| `status` | `open` \| `answered` \| `dismissed` |

### `GET /v1/questions`
Query: `status` (default `open`), `limit`, `cursor`.
Response `200`: `{ "data": [Question], "page": {...} }`

### `GET /v1/questions/count`
Leve, para o badge do ícone.
Response `200`: `{ "open": 3 }`

### `POST /v1/questions/:id/answer` ⭐ a ação principal do app
```json
{ "categoryId": "mercado", "learnRule": true, "applyToSimilar": true }
```
| Campo | Default | Efeito |
|---|---|---|
| `categoryId` | obrigatório | Slug válido de `/v1/categories` |
| `learnRule` | `true` | Cria regra permanente pro estabelecimento (P2) |
| `applyToSimilar` | `true` | Aplica a **todas** as transações pendentes com o mesmo estabelecimento |

Response `200`:
```json
{
  "transaction": { /* Transaction categorizada */ },
  "affectedTransactionIds": ["018f2222-...", "018f6666-..."],
  "ruleCreated": { "id": "018f7777-...", "pattern": "PAG*JL2201", "categoryId": "mercado" },
  "remainingOpenQuestions": 2
}
```
> `remainingOpenQuestions` permite atualizar o badge sem outra chamada.

### `POST /v1/questions/:id/dismiss`
Usuário não quer responder agora. Opcional: `{ "categoryId": "outros" }` para
jogar em Outros. Response `200`: `{ "transaction": {...}, "remainingOpenQuestions": 2 }`

---

## 8. Regras aprendidas

Materializa o P2 ("perguntar uma vez só"). O usuário pode auditar e corrigir
o que o app aprendeu.

### Objeto `Rule`
```json
{
  "id": "018f7777-...",
  "pattern": "PAG*JL2201",
  "matchType": "contains",
  "categoryId": "mercado",
  "merchantName": "Padaria JL",
  "source": "user",
  "hitCount": 7,
  "lastUsedAt": "2026-10-09T18:22:00Z",
  "createdAt": "2026-10-01T10:00:00Z"
}
```
| Campo | Tipo | Nota |
|---|---|---|
| `pattern` | string | Trecho do estabelecimento que dispara a regra |
| `matchType` | `"exact"` \| `"contains"` \| `"regex"` | Default na criação: `contains` |
| `merchantName` | string \| `null` | Nome amigável aplicado às transações que casarem |
| `source` | `"user"` \| `"dictionary"` | `dictionary` = embutida no app (read-only, não dá pra deletar; `PATCH` cria uma regra de usuário que sobrepõe) |
| `hitCount` | int | Quantas transações já categorizou |

### `GET /v1/rules`
Query: `search`, `categoryId`, `source`, `limit`, `cursor`.
Response `200`: `{ "data": [Rule], "page": {...} }`

### `POST /v1/rules`
```json
{ "pattern": "UBER", "matchType": "contains", "categoryId": "transporte",
  "merchantName": "Uber", "applyToExisting": false }
```
- `applyToExisting` (default `false`): se `true`, recategoriza as transações já
  existentes que casarem **e que não tenham** `categorySource: "user"`.

Response `201`: `{ "rule": Rule, "affectedCount": 0 }`

### `PATCH /v1/rules/:id`
Campos: `pattern`, `matchType`, `categoryId`, `merchantName`, `applyToExisting`.
Response `200`: `{ "rule": Rule, "affectedCount": 3 }`

### `DELETE /v1/rules/:id`
Response `204`. Regra `dictionary` → `403 FORBIDDEN`.

### `POST /v1/rules/test` — pré-visualização
Mostra o que uma regra faria **antes** de criar.
```json
{ "pattern": "UBER", "matchType": "contains" }
```
Response `200`:
```json
{ "matchCount": 23, "sample": [ { "id": "018f...", "merchantRaw": "UBER *TRIP SAO PAULO",
  "amountCents": 1890, "currentCategoryId": "outros" } ] }
```
- `sample`: até 10 transações.

---

## 9. Relatórios e dashboard

> Todos os endpoints desta seção **excluem** transações com `status: "ignored"`
> e **somam** estornos (valores negativos). `pending_category` entra, agregada
> sob `categoryId: null`.

### 9.1 `GET /v1/summary` — a tela principal

Query params:

| Param | Tipo | Default | Nota |
|---|---|---|---|
| `period` | `month` \| `statement` \| `custom` | `month` | `statement` usa o ciclo da fatura (`closingDay`) |
| `month` | `YYYY-MM` | mês atual | Com `period=month` ou `statement` |
| `from` / `to` | date | — | Obrigatórios se `period=custom` |
| `cardId` | uuid \| csv | todos | |
| `groupBy` | `category` \| `card` \| `day` \| `week` \| `group` | `category` | |

Response `200`:
```json
{
  "period": { "type": "month", "from": "2026-10-01T03:00:00Z", "to": "2026-11-01T02:59:59Z", "label": "Outubro 2026" },
  "totals": {
    "spentCents": 184530,
    "refundedCents": -4590,
    "netCents": 179940,
    "transactionCount": 87,
    "pendingCategoryCount": 3,
    "pendingCategoryCents": 12300,
    "dailyAverageCents": 5998,
    "projectedMonthCents": 185940
  },
  "comparison": {
    "previousNetCents": 165200,
    "deltaCents": 14740,
    "deltaPercent": 8.92
  },
  "byCategory": [
    { "categoryId": "mercado", "name": "Mercado", "icon": "🛒", "color": "#16a34a",
      "amountCents": 62300, "transactionCount": 14, "percent": 34.62,
      "previousAmountCents": 58000, "deltaPercent": 7.41 },
    { "categoryId": null, "name": "Não categorizado", "icon": "❓", "color": "#94a3b8",
      "amountCents": 12300, "transactionCount": 3, "percent": 6.83,
      "previousAmountCents": null, "deltaPercent": null }
  ],
  "byCard": [
    { "cardId": "018f1111-...", "name": "Nubank Roxinho", "color": "#820ad1",
      "amountCents": 120000, "transactionCount": 52, "percent": 66.69 }
  ],
  "byGroup": [
    { "group": "essencial", "amountCents": 98000, "percent": 54.46 },
    { "group": "fixo",      "amountCents": 42000, "percent": 23.34 },
    { "group": "variavel",  "amountCents": 39940, "percent": 22.20 }
  ],
  "timeline": [
    { "date": "2026-10-01", "amountCents": 4590, "transactionCount": 2 },
    { "date": "2026-10-02", "amountCents": 0,    "transactionCount": 0 }
  ]
}
```

Notas para o front:
- `byCategory`/`byCard`/`byGroup` vêm **sempre**, independente do `groupBy` —
  `groupBy` só define a ordenação/ênfase. Monte vários gráficos com uma chamada.
- `percent` é sobre `netCents`, já arredondado em 2 casas.
- `projectedMonthCents`: projeção do mês com base na média diária. `null` em
  períodos passados/fechados.
- `timeline` tem **todos** os dias do período, inclusive os de valor `0`
  (gráfico não fica com buraco).
- `deltaPercent` positivo = gastou **mais** que o período anterior.
- `comparison` vem `null` se não houver período anterior com dados.

### 9.2 `GET /v1/summary/months` — evolução
Query: `limit` (default `12`), `cardId`.
Response `200`:
```json
{ "data": [
  { "month": "2026-10", "label": "Out 2026", "netCents": 179940, "transactionCount": 87 },
  { "month": "2026-09", "label": "Set 2026", "netCents": 165200, "transactionCount": 79 }
] }
```

### 9.3 `GET /v1/insights` — alertas inteligentes
Query: `month` (default atual).
Response `200`:
```json
{ "data": [
  { "id": "018f8888-...", "type": "category_spike", "severity": "warning",
    "title": "Delivery subiu 62%",
    "description": "Você gastou R$ 420,00 em Delivery, 62% mais que em setembro.",
    "categoryId": "delivery", "amountCents": 42000, "deltaPercent": 62.3,
    "transactionIds": [] },
  { "id": "018f9999-...", "type": "budget_exceeded", "severity": "danger",
    "title": "Orçamento de Restaurante estourado",
    "description": "R$ 680,00 de R$ 600,00 (113%).",
    "categoryId": "restaurante", "amountCents": 68000, "deltaPercent": 13.3,
    "transactionIds": [] },
  { "id": "018faaaa-...", "type": "new_subscription", "severity": "info",
    "title": "Nova assinatura detectada",
    "description": "HBO MAX parece ser uma assinatura de R$ 55,90/mês.",
    "categoryId": "assinaturas", "amountCents": 5590, "deltaPercent": null,
    "transactionIds": ["018f...", "018f...", "018f..."] }
] }
```
| `type` | Quando aparece |
|---|---|
| `category_spike` | Categoria subiu muito vs. média |
| `budget_exceeded` | Passou do orçamento (§10) |
| `budget_warning` | Chegou a 80% do orçamento |
| `new_subscription` | Detectada recorrência nova (M2) |
| `price_increase` | Assinatura conhecida aumentou de preço |
| `unusual_amount` | Compra muito acima do normal para o estabelecimento |
| `duplicate_suspect` | Possível cobrança duplicada |
| `installment_load` | Parcelas futuras comprometem muito dos próximos meses |

- `severity` ∈ `info` \| `warning` \| `danger`.
- **A lista pode vir vazia** — trate o estado vazio.
- `type` é extensível: o front deve ignorar tipo desconhecido sem quebrar.

---

## 10. Orçamentos (M3)

### Objeto `Budget`
```json
{
  "id": "018fbbbb-...",
  "categoryId": "restaurante",
  "amountCents": 60000,
  "period": "monthly",
  "alertThresholdPercent": 80,
  "active": true,
  "createdAt": "2026-10-01T10:00:00Z"
}
```
- `categoryId`: `null` ⇒ orçamento **global** (do mês inteiro, todas as categorias).
- `period`: só `"monthly"` na v1.
- `alertThresholdPercent`: dispara push de aviso nesse %. Default `80`.

### `GET /v1/budgets`
Query: `month` (`YYYY-MM`, default atual) — para trazer o progresso já calculado.
Response `200`:
```json
{ "data": [
  { "budget": { /* Budget */ },
    "progress": { "spentCents": 68000, "remainingCents": -8000,
      "percent": 113.33, "status": "exceeded",
      "projectedCents": 70500, "daysLeft": 21 } }
] }
```
- `progress.status` ∈ `"ok"` (<80%) \| `"warning"` (80–99%) \| `"exceeded"` (≥100%).
- `remainingCents` negativo = estourou.

### `POST /v1/budgets`
```json
{ "categoryId": "restaurante", "amountCents": 60000, "alertThresholdPercent": 80 }
```
Response `201`: `Budget`. Já existe orçamento ativo pra essa categoria →
`409 CONFLICT`.

### `PATCH /v1/budgets/:id` → `200` `Budget` (campos: `amountCents`, `alertThresholdPercent`, `active`)
### `DELETE /v1/budgets/:id` → `204`

---

## 11. Assinaturas recorrentes (M2)

Detecção automática: mesmo estabelecimento + valor parecido (±10%) + intervalo
regular (~30 dias) ≥ 2 ocorrências.

### `GET /v1/subscriptions`
Response `200`:
```json
{ "data": [
  { "id": "018fcccc-...",
    "merchantName": "Netflix",
    "merchantRaw": "NETFLIX.COM",
    "categoryId": "assinaturas",
    "amountCents": 5590,
    "intervalDays": 30,
    "occurrenceCount": 8,
    "firstSeenAt": "2026-03-05T10:00:00Z",
    "lastChargedAt": "2026-10-05T10:00:00Z",
    "nextExpectedAt": "2026-11-05T10:00:00Z",
    "status": "active",
    "priceHistory": [
      { "amountCents": 4590, "since": "2026-03-05T10:00:00Z" },
      { "amountCents": 5590, "since": "2026-08-05T10:00:00Z" }
    ],
    "confirmed": false }
] }
```
| Campo | Nota |
|---|---|
| `status` | `"active"` \| `"paused"` (não cobrou no ciclo esperado) \| `"cancelled"` (marcado pelo usuário) |
| `confirmed` | `false` = detectado automaticamente, usuário ainda não confirmou. Mostre "é assinatura?" |
| `priceHistory` | Alimenta o insight `price_increase` |

Response inclui também:
```json
"totals": { "monthlyCents": 24580, "yearlyCents": 294960, "activeCount": 6 }
```

### `PATCH /v1/subscriptions/:id`
```json
{ "confirmed": true, "status": "cancelled", "merchantName": "Netflix", "categoryId": "assinaturas" }
```
Response `200`: o objeto atualizado.

### `DELETE /v1/subscriptions/:id`
`204`. Não é assinatura (falso positivo) — não apaga as transações, só o
agrupamento, e não detecta de novo.

---

## 12. Previsão de parcelas (M1)

### `GET /v1/forecast`
Quanto já está comprometido nos próximos meses por parcelas.
Query: `months` (default `6`, máx `24`).
Response `200`:
```json
{
  "data": [
    { "month": "2026-11", "label": "Nov 2026",
      "committedCents": 45000, "installmentCount": 7,
      "subscriptionsCents": 24580, "totalCents": 69580 },
    { "month": "2026-12", "label": "Dez 2026",
      "committedCents": 38000, "installmentCount": 6,
      "subscriptionsCents": 24580, "totalCents": 62580 }
  ],
  "totals": { "committedCents": 183000, "installmentCount": 24 }
}
```
- `committedCents`: parcelas futuras já contratadas.
- `subscriptionsCents`: assinaturas ativas esperadas.

---

## 13. Web Push

O **front** registra a subscription; o **back** envia.

### `GET /v1/push/public-key`
Response `200`: `{ "publicKey": "BEl62iUYgUivxIkv69..." }` (VAPID, base64url).

### `POST /v1/push/subscribe`
Envie o `PushSubscription.toJSON()` do navegador:
```json
{
  "endpoint": "https://web.push.apple.com/QEa...",
  "keys": { "p256dh": "BEl62iUYgUiv...", "auth": "k8JV6sjd..." },
  "userAgent": "Safari/iOS 18.0"
}
```
Response `201`: `{ "id": "018fdddd-...", "createdAt": "2026-10-10T12:00:00Z" }`
- Idempotente por `endpoint` (reenviar atualiza, não duplica).

### `DELETE /v1/push/subscribe`
Request: `{ "endpoint": "https://..." }` → `204`

### `POST /v1/push/test`
Dispara um push de teste pro device. Response `202`: `{ "sent": true }`.
Útil no botão "testar notificações" da tela de config.

### Formato do payload recebido no service worker
```json
{
  "type": "question",
  "title": "Onde classificar PAG*JL2201?",
  "body": "R$ 45,90 · Nubank Roxinho",
  "data": {
    "questionId": "018f5555-...",
    "transactionId": "018f2222-...",
    "url": "/questions/018f5555-..."
  },
  "actions": [
    { "action": "cat:mercado",     "title": "🛒 Mercado" },
    { "action": "cat:restaurante", "title": "🍽️ Restaurante" }
  ]
}
```
| `type` | Significado |
|---|---|
| `question` | Nova pergunta de categoria |
| `insight` | Alerta do `/v1/insights` |
| `budget` | Orçamento em risco/estourado |
| `test` | Push de teste |

- `actions`: até 2 (limite do iOS). Ao tocar numa action `cat:<slug>`, o service
  worker chama `POST /v1/questions/:id/answer` com aquele `categoryId`.
- `data.url` é a rota in-app para abrir ao tocar na notificação.

---

## 14. Ingestão (uso do front: Share Target e colar)

O front **não** precisa saber parsear nada. Só manda o texto cru.

### `POST /v1/ingest/raw`
```json
{
  "source": "share",
  "text": "Compra aprovada no seu cartão Nubank: R$ 45,90 em PAG*JL2201 em 09/10 às 15:22",
  "cardIdHint": "018f1111-...",
  "receivedAt": "2026-10-09T18:25:00Z"
}
```
| Campo | Obrigatório | Nota |
|---|---|---|
| `source` | sim | `share` \| `paste` \| `email` \| `shortcut` \| `manual` |
| `text` | sim | Texto cru, 1–8000 chars |
| `cardIdHint` | não | Ajuda quando o texto não identifica o cartão |
| `receivedAt` | não | Default = agora |

Response `201` (sucesso):
```json
{
  "status": "parsed",
  "transaction": { /* Transaction */ },
  "question": { /* Question ou null */ },
  "parser": { "bank": "nubank", "confidence": 0.95 }
}
```
Response `200` (não deu pra entender):
```json
{
  "status": "unparsed",
  "reason": "no_parser_matched",
  "extracted": { "amountCents": 4590, "merchantRaw": null, "occurredAt": null },
  "ingestId": "018feeee-..."
}
```
> **UX sugerida:** com `status: "unparsed"`, abra o formulário manual
> **pré-preenchido** com o que veio em `extracted` (pode ter campos `null`).

Response `409 DUPLICATE_TRANSACTION` se cair na regra de dedupe (§6.3).

### `POST /v1/ingest/statement` — import de fatura
`multipart/form-data`: `file` (CSV/OFX, máx 5 MB) + `cardId`.
Response `200`:
```json
{
  "imported": 42, "duplicatesSkipped": 3, "pendingCategory": 7,
  "transactions": [ /* Transaction */ ],
  "errors": [ { "line": 18, "reason": "invalid_amount" } ]
}
```

---

## 15. Export (M6)

### `GET /v1/export`
Query: `format` (`csv` \| `json`, default `csv`), `from`, `to`, `cardId`.
Response `200` com `Content-Disposition: attachment`.
- CSV, separador `,`, UTF-8 com BOM (abre certo no Excel BR), colunas:
  `id,occurredAt,cardName,merchantRaw,merchantName,categoryId,categoryName,amountCents,amount,currency,status,installment,tags,notes`
- A coluna `amount` vem formatada (`45,90`) por conveniência; `amountCents` é a
  fonte da verdade.

---

## 16. Checklist de implementação do front-end

Ordem sugerida, do que não depende de nada para o que depende:

1. `GET /v1/health` — indicador online/offline
2. `POST /v1/auth/register` / `login` / `refresh` — fluxo de sessão + interceptor 401
3. `GET /v1/categories` — cachear forte
4. `GET /v1/cards` + `POST /v1/cards` — onboarding (sem cartão, nada funciona)
5. `GET /v1/transactions` — lista com filtros e scroll infinito
6. `POST /v1/transactions` — lançamento manual
7. `GET /v1/questions` + `/count` + `answer` ⭐ — **o coração do app**
8. `GET /v1/summary` — dashboard
9. `GET /v1/insights`, `/v1/budgets`, `/v1/subscriptions`, `/v1/forecast`
10. `POST /v1/push/*` — notificações
11. `POST /v1/ingest/raw` — Share Target do PWA
12. `GET /v1/rules` — tela de auditoria do aprendizado
13. `GET /v1/export`

**Dica:** monte um mock a partir dos exemplos JSON deste arquivo. Todos foram
escritos para serem copiáveis direto.

---

## 17. Painel do admin (adição 1.0.4)

O front mostra estas rotas como o **Painel admin**, uma seção no topo de
Ajustes que só aparece com `user.role === "admin"`.

Todas exigem token de **admin**: sem token `401`, `member` `403 FORBIDDEN`.
**Nenhuma devolve dado financeiro** — só dados de conta. `:id` que não é UUID
⇒ `400 VALIDATION_ERROR`; UUID inexistente ⇒ `404`.

### `GET /v1/admin/system` (saúde do sistema)
Response `200`:
```json
{ "environment": "production", "release": "5802a0b-20261016215754",
  "startedAt": "2026-10-16T21:57:58Z", "database": "ok",
  "lastBackupAt": "2026-10-17T06:25:01Z" }
```
- `environment`: `production` | `staging` (homologação) | `development`.
- `release`: versão publicada (commit + data do deploy); `"dev"` rodando local.
- `startedAt`: quando a API iniciou (UTC, sem milissegundos, como em §0).
- `database`: `ok` | `error`. Banco com problema **continua `200`** com
  `"error"` — não é erro de rede.
- `lastBackupAt`: último backup diário bem-sucedido; `null` fora da produção,
  se ainda não houve backup ou se o registro do backup estiver ilegível.

### `GET /v1/admin/users`
Response `200`:
```json
{ "data": [ {
  "id": "018f...", "email": "filha@familia.com", "name": "Ana", "role": "member",
  "createdAt": "2026-10-16T12:00:00Z", "lastLoginAt": "2026-10-16T18:00:00Z",
  "disabledAt": null, "activeSessions": 2
} ] }
```
- `lastLoginAt`: último cadastro, login ou renovação de sessão (`null` = nunca).
- `activeSessions`: aparelhos com sessão aberta.

### `POST /v1/admin/users/:id/disable` → `204`
Bloqueia: a pessoa sai de todos os aparelhos na hora e não consegue entrar.
O próprio admin ⇒ `422 UNPROCESSABLE`. Id inexistente ⇒ `404`.

### `POST /v1/admin/users/:id/enable` → `204`
Desbloqueia (a pessoa entra de novo com a senha dela; sessões antigas
continuam derrubadas). `disable`/`enable` são idempotentes (repetir dá `204`).
O próprio admin ⇒ `422 UNPROCESSABLE`.

### `POST /v1/admin/users/:id/revoke-sessions` → `204`
Desconecta todos os aparelhos da pessoa (vale para o próprio admin). Ela
continua podendo entrar com a senha.

### `GET /v1/admin/invites`
Convites pendentes (não aceitos, não revogados, não vencidos).
Response `200`: `{ "data": [ { "id": "018f...", "email": "filha@familia.com", "createdAt": "...", "expiresAt": "..." } ] }`

### `POST /v1/admin/invites`
Request: `{ "email": "filha@familia.com" }` → Response `201` com o convite.
Envia um e-mail de convite (sem nenhum dado financeiro). Convidar de novo o
mesmo e-mail substitui o convite anterior. E-mail que já tem conta ⇒
`409 CONFLICT`. Servidor sem e-mail ⇒ `503`. Rate limit: 20 por hora.

### `DELETE /v1/admin/invites/:id` → `204`
Revoga o convite. Já usado/revogado/vencido ou inexistente ⇒ `404`.

---

## Changelog

### 1.0.5 — 2026-10-19
- §1 `refresh`/`logout`: pedido de outro site usando o cookie ⇒ `403 FORBIDDEN`;
  `logout` com rate limit próprio (30/15 min). O PWA não é afetado.
- Infra (P-15): com `PROXY_SECRET` configurado, a API recusa com
  `403 FORBIDDEN` quem não vier pelo proxy da Vercel (exceto `GET /v1/health`).

### 1.0.4 — 2026-10-16
- **Família (D16):** a primeira conta vira admin; depois só entra quem o admin
  convidar. `user.role` em login/register/refresh/me.
- §1: `GET /v1/auth/registration`; regras novas de `register` e `email-code`;
  login de conta bloqueada ⇒ `403 FORBIDDEN`.
- §17: painel do admin (saúde do sistema, usuários, bloquear, desconectar,
  convites).
- Bloqueio, troca de senha e "desconectar" derrubam também o access token na
  hora (antes valia até 15 min).
- Mudança de comportamento: depois do admin, `register` sem convite não dá
  mais `403 REGISTRATION_CLOSED` (dá `400 INVALID_EMAIL_CODE`). Produção não
  tinha conta, então nada quebrou de fato.

### 1.0.3 — 2026-10-16
- §1: `POST /v1/auth/email-code` (código de 6 dígitos por e-mail) e
  `POST /v1/auth/password-reset` (esqueci a senha).
- §1 `register`: campo `emailCode`, obrigatório quando o servidor envia e-mail.
  Não afeta a produção atual (a conta do dono já existe), mas a tela Criar
  conta precisa do passo do código — ver `DECISOES.md` P-18.
- §2: código `400 INVALID_EMAIL_CODE`.
- Produção exige e-mail configurado (o servidor não sobe sem SMTP).

### 1.0.2 — 2026-10-16
- §1 `register`: campo opcional `setupCode`, exigido em produção
  (`403 FORBIDDEN` se ausente/errado). Achado da revisão de segurança: sem
  ele, quem chamasse o cadastro antes do dono viraria dono.
- §1 `register`: `name` documentado como obrigatório (1–80).
- §2: `429 RATE_LIMITED` traz `Retry-After` também no bloqueio por conta.
- Todas as respostas: `Cache-Control: no-store`.

### 1.0.1 — 2026-10-16
- §1: refresh token também em cookie `HttpOnly` `clivra_rt`; `refresh`/`logout`
  aceitam corpo **ou** cookie. Adição — nada quebra. O `refreshToken` no corpo
  só sai numa futura v2.0.0, depois que o front migrar (P-13).
- Implementado e testado no back-end: `health`, `register`, `login`,
  `refresh`, `logout`, `me`.

### 1.0.0 — 2026-10-10
- Versão inicial. Contrato completo: auth, cartões, transações, perguntas,
  regras, relatórios, orçamentos, assinaturas, previsão, push, ingestão, export.
- Baseado nas decisões D1–D8 de `docs/DECISOES.md` e nas melhorias M1–M6.
- **Status: estável.** O front-end pode implementar. Adições retrocompatíveis
  (campos/endpoints novos opcionais) podem acontecer sem aviso, registradas aqui.
  Mudança que quebra exige acordo dos dois lados.
