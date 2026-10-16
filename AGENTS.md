# Cartão — Controle de Gastos (AGENTS.md)

> **Este arquivo é a fonte da verdade compartilhada entre TODOS os agentes de IA
> que trabalham neste repositório** (ChatGPT/Codex no front-end, Claude no back-end)
> e também para o desenvolvedor humano.
>
> Se você é um agente e acabou de entrar neste repo: **leia este arquivo inteiro
> antes de escrever qualquer linha de código.** Depois leia `docs/CONTRATO-API.md`.

---

## 1. O que é o produto

App pessoal de controle de gastos de cartão de crédito/débito, multi-banco.

**Fluxo central:**

1. O usuário faz uma compra em qualquer um dos seus cartões (hoje: 2 bancos).
2. O sistema captura o evento da compra (valor + estabelecimento) automaticamente.
3. Uma IA classifica a compra em uma categoria (Mercado, Restaurante, Transporte...).
4. **Se a IA não tiver confiança suficiente, ela NÃO inventa** — ela cria uma
   pergunta para o usuário ("onde eu classifico `PAG*JL2201`?") e manda um push.
5. O usuário responde em 1 toque. O sistema **aprende** aquele estabelecimento e
   nunca pergunta de novo sobre ele.
6. O app mostra dashboards: gasto por categoria, por cartão, por mês, evolução.

**Forma de entrega:** PWA (Progressive Web App) instalável. O usuário abre no
Safari do iPhone → "Compartilhar" → "Adicionar à Tela de Início" → o ícone fica
na home como um app nativo. **Não vai pra App Store.**

---

## 2. Princípios do produto (não violar)

| # | Princípio |
|---|-----------|
| P1 | **Nunca inventar categoria.** Baixa confiança ⇒ perguntar ao usuário. |
| P2 | **Perguntar uma vez só.** Resposta do usuário vira regra permanente para aquele estabelecimento. |
| P3 | **Zero digitação no caminho felizmente automático.** Lançamento manual existe, mas é o plano B. |
| P4 | **Dado financeiro é sensível.** Nada de log de valor/estabelecimento em texto claro em serviço de terceiro. Sem telemetria. |
| P5 | **Offline-tolerante.** O app abre e mostra os últimos dados mesmo sem rede. |
| P6 | **Custo ~zero.** Tiers gratuitos sempre que possível. LLM só quando o cache de regras não resolve. |

---

## 3. A restrição que define a arquitetura (LEIA)

**O iOS não permite que nenhum app — nativo ou PWA — leia as notificações de
outros apps.** Não existe API para isso. (No Android existe:
`NotificationListenerService`. No iPhone, não.)

Portanto **é impossível** um app no iPhone "escutar" a notificação do Nubank/Itaú
e capturar a compra sozinho. Qualquer pessoa que prometa isso no iOS está errada.

Os caminhos que **realmente funcionam** no iPhone estão em
`docs/ARQUITETURA.md` §2. Resumo dos 4 viáveis:

| Caminho | Como funciona | Automático? | Custo | Cobre cartão físico? |
|---|---|---|---|---|
| **A. Open Finance** (Pluggy/Belvo/Klavi) | API lê as transações direto da conta/fatura do banco | Sim (sincroniza a cada X h) | Sandbox grátis; produção paga | **Sim** |
| **B. E-mail do banco → webhook** | Regra de encaminhamento no Gmail manda o e-mail de compra pro backend, que faz o parse | Sim, quase instantâneo | Grátis | **Sim** |
| **C. Atalhos iOS + gatilho de transação** | Automação do app Atalhos dispara a cada transação de um cartão no Wallet e faz POST no backend | Sim | Grátis | Só Apple Pay |
| **D. Compartilhar / colar** | Usuário compartilha o print/texto da notificação pro PWA (Share Target) ou cola | Semi | Grátis | Sim |

**Decisão de arquitetura:** o backend expõe **um único endpoint de ingestão
genérico** (`POST /v1/ingest/raw`) que aceita texto cru de *qualquer* uma dessas
fontes e roda um pipeline de parsing. Isso deixa as 4 estratégias plugáveis sem
reescrever nada, e deixa o front-end 100% independente de qual fonte está ativa.

**O front-end NUNCA precisa saber de onde veio a transação.** Ele só consome a
API de transações. Isso é o que permite o trabalho em paralelo.

---

## 4. Divisão de trabalho entre os agentes

Fronteira **física** (por pasta) para dois agentes nunca editarem o mesmo arquivo:

```
c:\Cartao
├── AGENTS.md              ← compartilhado. Só o humano edita.
├── CLAUDE.md       ← aponta pra cá + regras do Claude
├── docs/
│   ├── CONTRATO-API.md    ← CONTRATO. Só muda com acordo dos dois lados.
│   ├── ARQUITETURA.md
│   └── DECISOES.md        ← decisões pendentes / registro
├── backend/               ← 🤖 CLAUDE (back-end). ChatGPT NÃO edita.
└── frontend/              ← 🤖 CHATGPT (front-end). Claude NÃO edita.
```

### Responsabilidade do **back-end** (Claude)
- API REST, autenticação, banco de dados, migrations.
- Pipeline de ingestão e parsers por banco.
- Motor de categorização (IA + cache de regras aprendidas).
- Fila de perguntas pendentes e aprendizado.
- Web Push (envio).
- Agregações/relatórios (`/v1/summary`, `/v1/insights`).
- Deploy do servidor.

### Responsabilidade do **front-end** (ChatGPT)
- PWA: manifest, service worker, ícones, instalação na home do iPhone.
- Telas: lista de transações, dashboard, fila de perguntas, cartões, config.
- Estado/cache local (offline) e sincronização.
- Registro da subscription de Web Push (envio é do back).
- UX de "responder categoria em 1 toque".

### Regra de ouro
> **Toda comunicação entre as duas metades acontece via `docs/CONTRATO-API.md`.**
> Nenhum agente adivinha o formato do outro. Se o contrato não cobre um caso,
> o agente **escreve a dúvida em `docs/DECISOES.md` §Pendências** em vez de
> inventar — e o humano leva pro outro agente.

---

## 5. Stack

### Back-end
- **Runtime:** Node 24 + TypeScript (ESM, `strict: true`)
- **Framework:** Fastify
- **Validação:** Zod (schemas compartilhados, geram o OpenAPI)
- **Banco:** PostgreSQL (Neon ou Supabase, free tier)
- **ORM/migrations:** Drizzle ORM
- **LLM de categorização:** Anthropic Claude Haiku (barato) — abstraído atrás de
  uma interface `Categorizer`, trocável
- **Push:** `web-push` (VAPID)
- **Testes:** `node:test` + Supertest
- **Deploy:** Fly.io ou Railway

### Front-end
- **Framework:** React + Vite + TypeScript
- **PWA:** `vite-plugin-pwa` (Workbox)
- **Estilo:** Tailwind CSS
- **Dados:** TanStack Query (cache + offline)
- **Gráficos:** Recharts
- **Deploy:** Vercel ou Cloudflare Pages

> O front **precisa** ser servido em HTTPS para o PWA instalar e o Push funcionar
> no iOS (iOS 16.4+ suporta Web Push em PWA instalado na home).

---

## 6. Convenções de código (ambos os lados)

- **Idioma:** código, nomes de variáveis, tipos e commits em **inglês**.
  Comentários, docs e textos de UI em **português do Brasil**.
- **Dinheiro:** sempre **inteiro em centavos** (`amountCents: number`). Nunca
  float. Nunca `string` em cálculo. Moeda em campo separado (`currency: "BRL"`).
- **Datas:** sempre **ISO 8601 em UTC** no transporte (`2026-10-10T14:32:00Z`).
  Conversão para `America/Sao_Paulo` é responsabilidade da camada de exibição.
- **IDs:** UUID v7 (ordenável por tempo).
- **Erros da API:** sempre o envelope de erro definido no contrato. Nunca
  vazar stack trace.
- **Segredos:** só em `.env` (nunca commitado). Cada lado tem seu `.env.example`.
- **Commits:** Conventional Commits com escopo do lado:
  `feat(backend): ...`, `fix(frontend): ...`, `docs: ...`

---

## 7. Como rodar (preenchido conforme for construído)

```powershell
# back-end
cd C:\Cartao\backend ; npm install ; npm run dev     # http://localhost:3333

# front-end
cd C:\Cartao\frontend ; npm install ; npm run dev    # http://localhost:5173
```

O front em dev aponta pro back via `VITE_API_URL=http://localhost:3333`.

---

## 8. Estado atual do projeto

**Fase 0 — fundação (em andamento).**
Veja `docs/DECISOES.md` para o que está decidido, o que está pendente e o
roadmap por fases.
