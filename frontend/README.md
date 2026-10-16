# Front-end Cartão

PWA em React, Vite e TypeScript para o contrato em `../docs/CONTRATO-API.md`.

## Rodar localmente

Requer Node 24. No PowerShell:

```powershell
cd C:\Cartao\frontend
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

O app abre em `http://localhost:5173`. As chamadas `/v1/*` usam o proxy local do Vite para `http://localhost:3333`. Deixe `VITE_API_URL` vazio para manter front e API na mesma origem. Para conferir o pacote de produção, use `npm.cmd run build` e `npm.cmd run preview`.

## Acesso à conta

A tela de entrada segue `prototypes/acesso-v2-mobile.png` e `prototypes/acesso-v2-desktop.png`. Login e cadastro inicial usam os endpoints do contrato. O cadastro só funciona antes da criação do primeiro usuário. O access token fica apenas na memória; o refresh fica no cookie `HttpOnly` da API. Ao abrir o app, o front tenta `/v1/auth/refresh` para restaurar a sessão. A chave antiga `cartao.refreshToken` é removida do `localStorage`.

Em produção, configurar em `vercel.json` o rewrite de `/v1/:path*` para a URL HTTPS definitiva da VPS, antes do fallback do SPA. Essa URL ainda está pendente em `../docs/DECISOES.md` (P-13).

## PWA

O service worker guarda somente os arquivos estáticos necessários para abrir o app offline. Os dados da API não são armazenados por ele; o cache de dados fica a cargo do TanStack Query. O front-end deve ser publicado em HTTPS para instalação e notificações no iPhone.

O manifesto registra `POST /share` como destino de texto compartilhado, onde houver suporte do navegador. O service worker recebe `title`, `text` e `url`, guarda temporariamente o conteúdo em IndexedDB e abre a rota `/share` sem incluir o texto na URL. Para retirar o próximo compartilhamento, a página envia `{ type: 'TAKE_SHARED_TEXT' }` ao service worker por `MessageChannel`; a resposta é `{ type: 'SHARED_TEXT', text: string | null }`. A página então chama `POST /v1/ingest/raw` com `source: 'share'` após a autenticação. Se o Share Target não estiver disponível, use a opção de colar texto no app.

O clique em uma ação de categoria de uma notificação guarda a escolha temporariamente em IndexedDB e abre `/questions/:id`. A página recupera a sessão, consome a escolha e envia `POST /v1/questions/:id/answer` com as credenciais em memória. O service worker não recebe nem persiste tokens.

## Fluxo de revisão das telas

1. Preparar uma prévia visual com dados fictícios e esperar a aprovação antes de alterar a tela.
2. Implementar a tela aprovada usando os formatos de `../docs/CONTRATO-API.md`.
3. **A cada tela implementada ou alterada**, rodar o build e usar o MCP do Playwright no navegador para conferir a versão de iPhone e a de desktop. Exercitar os fluxos principais e os estados de erro, vazio e offline quando aplicáveis; verificar também erros no console e falhas de requisição. Corrigir os achados antes de dar a tela por concluída.
4. Pedir a outro agente uma revisão independente dos fluxos alterados e de privacidade e segurança, restrita a `frontend/`. Verificar especialmente isolamento do cache entre sessões, autenticação, conteúdo de notificações e ausência de dados financeiros em logs ou serviços de terceiros.
5. Corrigir os achados e repetir apenas os testes afetados antes de apresentar o resultado.

O Playwright MCP é uma ferramenta de inspeção do navegador. Testes de regressão reproduzíveis devem ficar no projeto quando houver fluxos implementados a proteger.

## Skills para revisão

Usar a skill local Find Skills e o catálogo [skills.sh](https://skills.sh/) para procurar apoio de revisão de código, React e interface. Antes de adotar uma skill externa, conferir autor, arquivos e scripts da origem, número de instalações e relatórios de auditoria do catálogo. Uma auditoria é um indício, não garantia de segurança. Não instalar uma skill somente pelo nome ou pela posição no ranking.

O nome “Skill Spectra”, citado para analisar skills antes da instalação, ainda precisa de um link ou repositório exato: há projetos diferentes chamados Spectra e nenhum correspondente confirmado neste repo. Enquanto isso, a conferência manual acima é obrigatória. Candidatas para avaliar quando forem necessárias: [vercel-react-best-practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices) para React, [web-design-guidelines](https://skills.sh/vercel-labs/agent-skills/web-design-guidelines) para interface e acessibilidade e [code-review](https://skills.sh/vercel-labs/open-agents/code-review) para revisar diffs. O MCP do Playwright já atende à etapa de teste no navegador.
