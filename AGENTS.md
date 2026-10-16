# CLIVRA — guia dos agentes

Fonte única para todos os agentes (**Claude = back-end**, **ChatGPT = front-end**)
e para o humano. É curto de propósito: o detalhe de cada parte está no documento
da própria pasta (tabela da §5). Leia este arquivo inteiro antes de começar.

## 1. Produto

PWA pessoal de controle de gastos de cartão (Nubank e Itaú), instalado na tela
inicial do iPhone (Safari → Compartilhar → Adicionar à Tela de Início). Sem App
Store. **Uso em família (D16):** um **admin** (quem instalou) e familiares
que ele **convida**. Cada pessoa vê **só os próprios** cartões e gastos; o
painel do admin mostra só dados de conta (quem tem acesso, convites,
bloqueio), nunca gastos dos outros.

Fluxo: a compra entra no app (colar o texto da notificação, Atalhos do iOS ou
lançamento manual) → categoria automática → se não houver certeza, **pergunta em
1 toque** → a resposta vira regra permanente → dashboards por categoria, cartão
e mês.

## 2. Princípios (não violar)

| # | Princípio |
|---|---|
| P1 | **Nunca inventar categoria.** Sem certeza ⇒ perguntar ao usuário. |
| P2 | **Perguntar uma vez só.** A resposta vira regra para aquele estabelecimento. |
| P3 | **Zero digitação no caminho feliz.** Lançamento manual é o plano B. |
| P4 | **Dado financeiro é sensível.** Nada de valor/estabelecimento em log ou serviço de terceiro. Sem telemetria. |
| P5 | **Offline-tolerante**, sem expor dados a quem não fez login. |
| P6 | **Custo zero.** Só planos gratuitos. |

## 3. Restrições que definem a arquitetura

- **O iOS não deixa nenhum app ler notificações de outro app.** No iPhone a
  compra entra por **colar texto** ou **Atalhos do iOS** (`POST /v1/ingest/raw`).
  Web Share Target não funciona no Safari.
- **Custo zero:** Vercel (plano grátis) + VPS **Oracle Always Free**. O disco de
  200 GB da VPS já é todo o armazenamento grátis — não criar volumes novos.

## 4. Arquitetura em produção

**App em produção: https://clivra-puce.vercel.app/**

```
iPhone (PWA) ──HTTPS──▶ Vercel ──┬─ /*     → arquivos do PWA (frontend/)
                                 └─ /v1/*  → proxy ──▶ clivra-api.163-176-182-24.sslip.io
                                                       VPS Oracle: Caddy → API Node (backend/) → Postgres
```

- Para o navegador, site e API são **a mesma origem** ⇒ sessão em cookie
  `HttpOnly`, sem CORS. O front chama sempre caminhos relativos (`/v1/...`).
- **Deploy do front:** `git push` em `main` do GitHub privado `JoaoJuk/clivra`
  ⇒ a Vercel publica sozinha (Root Directory `frontend`).
- **Deploy do back:** `backend/deploy/deploy.sh` (ver `backend/CLAUDE.md`).

## 5. Mapa do repositório

| Caminho | Dono | O que é |
|---|---|---|
| `AGENTS.md` | humano | este guia |
| `CLAUDE.md` | humano | regras extras do Claude (importa este arquivo) |
| `docs/CONTRATO-API.md` | acordo dos dois | **o contrato da API** — única fonte de formatos, campos e erros |
| `docs/DECISOES.md` | os dois agentes | decisões, **status por tela** e **pendências abertas** |
| `backend/` | Claude | API — detalhes em `backend/CLAUDE.md` |
| `frontend/` | ChatGPT | PWA — detalhes em `frontend/README.md` |
| `.claude/agents/` | Claude | subagentes revisores (segurança, contrato) |

## 6. Como os agentes colaboram

1. **Só por arquivos.** Os agentes não conversam: o contrato define os formatos
   e `docs/DECISOES.md` §Pendências guarda perguntas e respostas. Se o contrato
   não cobre algo, **abra uma pendência** — não invente.
2. **Contrato:** mudança que quebra exige acordo dos dois; adição
   retrocompatível pode, registrada no Changelog do contrato.
3. **Fronteira:** um agente não edita a pasta do outro sem autorização explícita
   do humano — e, se editar, registra o que fez em `DECISOES.md`.
4. **Tela por tela:** prévia aprovada → front (com mock) e back (com testes) →
   integração → revisão de segurança → teste no iPhone → commit e deploy.
5. **Conferir no disco:** um turno pode ser cortado; arquivo só existe depois
   de conferido no disco/git.
6. **Git:** commits pequenos em Conventional Commits com escopo
   (`feat(backend):`, `fix(frontend):`, `docs:`), push em `origin/main`.
   Nunca commitar `.env` nem segredo.

## 7. Stack

- **Back:** Node 24, TypeScript ESM `strict`, Fastify 5, Zod 4, Drizzle,
  Postgres 16 (PGlite em dev/teste), `node:test`.
- **Front:** React + Vite + TypeScript, `vite-plugin-pwa`, TanStack Query, Recharts.
- **Categorização:** regra aprendida → dicionário local → **Jev** (TypeSafe AI;
  só o nome do estabelecimento sai da VPS) → pergunta ao usuário.

## 8. Convenções

- Código, nomes e commits em **inglês**; comentários, docs e UI em **pt-BR**.
- Dinheiro: **inteiro em centavos**. Datas: **ISO 8601 UTC com `Z`**. IDs: **UUID v7**.
- Erros sempre no envelope do contrato (§2), sem stack trace.
- Segredos só em `.env` (fora do git); na VPS, em `/etc/clivra/`.

## 9. Rodar localmente (PowerShell)

```powershell
cd C:\Cartao\backend ; npm install ; Copy-Item .env.example .env ; npm run dev   # 127.0.0.1:3333 (preencha JWT_SECRET no .env)
cd C:\Cartao\frontend ; npm install ; npm run dev                                 # localhost:5173 (proxy /v1 → 3333)
```

## 10. Onde estamos

Ver **`docs/DECISOES.md` §Status por tela** e **§Pendências abertas** — é por
lá que todo agente começa o trabalho.
