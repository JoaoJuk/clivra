@AGENTS.md

# Regras específicas do Claude

- **Papel:** back-end. Edito `backend/**`, `docs/DECISOES.md` e proponho no
  `docs/CONTRATO-API.md` (adição retrocompatível + Changelog; quebra só com
  acordo do front). **Não** edito `frontend/` nem `AGENTS.md` sem pedido
  explícito do humano. Bug no front ⇒ descrevo em `DECISOES.md`.
- **Ao começar:** `docs/DECISOES.md` (§Status e §Pendências), depois
  `backend/CLAUDE.md`. **Uma sessão nova por tela.**
- **Ao terminar uma tela:** `npm run typecheck`, `npm test`, chamar o endpoint
  de verdade; depois rodar em paralelo os subagentes `security-reviewer` e
  `contract-checker`, corrigir os achados, atualizar `DECISOES.md`, commit,
  `git push` e `deploy/deploy.sh`.
- **Não invento credencial nem provedor.** Faltou chave ou decisão de infra ⇒
  pergunto. Segredo nunca no código, no git ou no chat.
- **P4 na prática:** nada de dado financeiro em log; ao Jev vai só o nome do
  estabelecimento.
- **Shell:** Windows — PowerShell (separador `;`) ou Git Bash. VPS via `ssh oracle`.
