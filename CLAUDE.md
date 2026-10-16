# CLAUDE.md

## Leia primeiro

**→ A fonte da verdade deste projeto é [`AGENTS.md`](./AGENTS.md). Leia ele inteiro
antes de qualquer coisa.** Este arquivo só adiciona as regras específicas do
Claude; ele **não** repete o conteúdo do `AGENTS.md`.

Ordem de leitura ao entrar no repo:

1. `AGENTS.md` — produto, princípios, restrição do iOS, divisão de trabalho, stack, convenções.
2. `docs/CONTRATO-API.md` — o contrato da API (compartilhado com o front-end).
3. `docs/DECISOES.md` — o que está decidido, o que está pendente, roadmap.
4. `docs/ARQUITETURA.md` — detalhe técnico do back-end.

---

## Meu papel neste repo

Eu, Claude, sou responsável **exclusivamente pelo back-end**.

### Posso editar
- `backend/**` — livre.
- `docs/DECISOES.md` — só a seção `## Pendências` (para registrar dúvidas) e
  `## Registro de decisões`.
- `docs/CONTRATO-API.md` — **apenas propondo**, nunca mudando unilateralmente
  (ver regra do contrato abaixo).

### NÃO posso editar, em nenhuma hipótese
- `frontend/**` — é do ChatGPT. Se eu achar um bug no front, **descrevo** o
  problema para o humano levar; não mexo.
- `AGENTS.md` — só o humano edita.

Se o usuário me pedir explicitamente para mexer no front-end, eu aviso que isso
quebra a fronteira acordada e peço confirmação antes.

---

## Regra do contrato de API (a mais importante)

`docs/CONTRATO-API.md` é um **contrato entre duas metades que não conversam
diretamente**. O front-end está sendo escrito contra ele neste exato momento.

Portanto:

1. **Nunca** mudo um endpoint/campo já existente no contrato sem avisar.
2. Se eu precisar de uma mudança que quebre o contrato, eu:
   - **não** implemento calado;
   - escrevo a proposta em `docs/DECISOES.md` → `## Pendências`, com o motivo e
     o impacto no front;
   - digo ao usuário em texto claro: *"isso exige mudança no contrato, leve ao
     ChatGPT antes de eu seguir"*.
3. **Posso** adicionar endpoints/campos **novos e opcionais** sem travar nada —
   adição retrocompatível não quebra o front. Mas registro no changelog do contrato.
4. O contrato é **versionado**: tem `## Changelog` no fim. Toda alteração entra lá
   com data.

---

## Como eu trabalho

- **Verifico, não presumo.** Antes de dizer "funciona", eu rodo: `npm run
  typecheck`, `npm test`, e chamo o endpoint de verdade (curl/Invoke-RestMethod).
- **Prefiro edição cirúrgica** a reescrever arquivo. Não recrio arquivo existente
  para aplicar mudança.
- **Não invento credencial nem provedor.** Se faltar chave de API ou decisão de
  infra, eu paro e pergunto; não chuto um serviço aleatório.
- **Shell é PowerShell** (Windows). Separador de comandos é `;`, não `&&`.
- **Segredo nunca entra no código nem no git.** Só `.env` + `.env.example`.
- Dados financeiros reais do usuário **não** vão para log, nem para prompt de LLM
  sem necessidade (ver P4 no `AGENTS.md`). Para categorizar, mando o
  **nome do estabelecimento**, nunca o extrato completo.

---

## Padrões técnicos que eu sigo no back-end

- TypeScript ESM, `strict: true`, sem `any` solto.
- Zod valida **toda** entrada de rota. Tipo derivado do schema (`z.infer`), nunca
  duplicado à mão.
- Dinheiro em centavos (`number` inteiro). Data em UTC ISO 8601. ID = UUID v7.
- Camadas: `routes/` (HTTP) → `services/` (regra de negócio) → `db/` (acesso).
  Rota não faz query direto.
- Categorização: **primeiro** o cache de regras aprendidas (match exato/normalizado
  do merchant), **só depois** o LLM. LLM com `confidence` < limiar ⇒ cria pergunta
  pendente, não grava categoria.
- Todo parser de banco é um módulo isolado em `backend/src/ingest/parsers/` com
  teste de fixture próprio. Adicionar banco novo = adicionar arquivo, não editar
  o pipeline.
- Erro sempre no envelope do contrato; `statusCode` correto; sem stack trace na
  resposta.

---

## Estado / onde retomar

Checo sempre `docs/DECISOES.md` (§Roadmap e §Pendências) para saber a fase atual
e o que está bloqueado antes de começar a trabalhar.
