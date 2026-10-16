# backend/ — guia de referência

Complementa o `CLAUDE.md` da raiz e o `AGENTS.md`. Aqui fica **como o código do
back-end está organizado** e o que toda rota nova precisa cumprir.

## Rodar

```powershell
cd C:\Cartao\backend
npm install
Copy-Item .env.example .env   # e preencher JWT_SECRET
npm run dev                   # http://127.0.0.1:3333
npm test                      # node:test + PGlite em memória
npm run typecheck
npm run db:generate -- --name <nome>   # depois de mudar src/db/schema.ts
```

Banco em dev/teste: **PGlite** (Postgres embutido, sem Docker). `DATABASE_URL`
vazio ⇒ PGlite em `PGLITE_DIR`. Produção: Postgres real (D4). Migrations rodam
sozinhas no boot (`src/server.ts`).

## Produção (VPS Oracle Always Free — D12)

- **URL:** `https://clivra-api.163-176-182-24.sslip.io` (o front chega via proxy
  `/v1/*` da Vercel). Ubuntu 24.04 ARM, host SSH `oracle`.
- **Deploy:** commit, depois `bash deploy/deploy.sh` (Git Bash, em `backend/`).
  Faz typecheck + testes + build, sobe para `/opt/clivra/releases/<sha>`,
  `npm ci --ignore-scripts`, troca o link `current`, reinicia e confere o health.
  Mantém 3 releases. Rollback: apontar `/opt/clivra/current` para a anterior e
  `sudo systemctl restart clivra`.
- **Serviço:** `clivra.service` (usuário `clivra`, sandbox systemd, só
  `127.0.0.1:3333`). Logs: `sudo journalctl -u clivra`.
- **Banco:** Postgres 16 local, só socket/localhost, role `clivra` por peer
  auth (sem senha). Backup diário `/etc/cron.daily/clivra-backup` →
  `/var/backups/clivra` (14 dias, mesmo disco — não protege contra perda da VPS).
- **Segredos:** `/etc/clivra/clivra.env` (root, 0600), gerados na própria VPS.
  Código do primeiro cadastro: `ssh oracle sudo grep OWNER_SETUP_CODE /etc/clivra/clivra.env`.
- **E-mail:** SMTP do Gmail (`SMTP_USER`/`SMTP_PASS` no `clivra.env`, senha de
  app). Portas 465/587 de saída liberadas na VPS.
- **Caddy:** bloco próprio no `/etc/caddy/Caddyfile` (`deploy/Caddyfile.clivra`);
  o site `163-176-182-24.sslip.io` (painel do usuário) **não é nosso — não mexer**.
- **Limites Always Free:** disco de 200 GB já é o total grátis (não criar
  volume). Máquina ociosa por 7 dias pode ser desligada pela Oracle.

## Camadas (não pular)

```
src/routes/    HTTP: schema Zod de body/query/params/response, rate limit, preHandler
   ↓
src/services/  regra de negócio; lança AppError (src/lib/errors.ts)
   ↓
src/db/        queries Drizzle; uma função por operação; recebe `db: Db`
```

- Rota **nunca** importa de `src/db/` direto.
- `app.ts` monta tudo (injeção de dependência manual: service recebe `db`).
- Tipos derivados do schema (`z.infer`, `$inferSelect`) — nunca duplicados.

## Checklist de toda rota nova

1. **Schema Zod de entrada** (body/query/params) e **de resposta** — o schema de
   resposta é a lista do que pode sair; campo interno nunca vaza.
2. **`preHandler: requireAuth`** em tudo que não for `health`/`auth`.
3. **Isolamento por dono:** toda query de recurso filtra por `request.userId`
   (mesmo sendo app de 1 pessoa — defesa em profundidade contra IDOR).
4. Erros só via `AppError`/`errors.*` → envelope do contrato §2.
5. Dinheiro `int` centavos; datas `toIso()`; IDs `newId()` (UUID v7).
6. Rate limit específico se a rota for cara ou sensível.
7. Teste em `test/<recurso>.test.ts`: caminho feliz, validação, 401 sem token,
   404 de recurso de outro dono/inexistente.
8. Registrar no `docs/CONTRATO-API.md` §Changelog se adicionou algo.

## Segurança já implantada (não remover)

| Proteção | Onde |
|---|---|
| Argon2id (OWASP) + tempo constante p/ e-mail inexistente | `services/passwords.ts` |
| JWT HS256 com alg/iss/aud fixos | `services/tokens.ts` |
| Refresh opaco, só hash no banco, rotação + detecção de reuso | `services/auth.ts`, `db/refresh-tokens.ts` |
| Cookie `clivra_rt` HttpOnly/SameSite=Strict/Path=/v1/auth | `routes/auth.ts` |
| Rate limit global (300/min) + por rota; login: conta+IP (10) e conta (100) em 15 min | `app.ts`, `services/auth.ts`, `services/login-throttle.ts` |
| `setupCode` obrigatório no 1º cadastro em produção (`OWNER_SETUP_CODE`) | `services/auth.ts`, `config.ts` |
| `TRUST_PROXY` só por nº de saltos/IPs (nunca `true`); `HOST` loopback em produção | `config.ts`, `app.ts` |
| Erro no log sem mensagem/params/detail (Drizzle/Postgres) | `lib/log.ts` |
| `Cache-Control: no-store` em tudo | `app.ts` |
| Helmet (CSP `default-src 'none'`), CORS com origens exatas | `app.ts` |
| Parser JSON seguro (bloqueia `__proto__`), body ≤ 64 KB | `app.ts` |
| Log sem query string, corpo, cookie, Authorization (P4) | `app.ts` (serializers) |
| Um único dono garantido no banco | `db/schema.ts` (`users_single_owner_key`) |
| Código por e-mail: HMAC no banco, 10 min, uso único, 5 tentativas por código (atômico), 60 s entre envios e 5/dia (advisory lock), códigos anteriores seguem válidos (anti-bloqueio) | `services/email-codes.ts`, `db/email-codes.ts` |
| "Esqueci a senha" responde antes de consultar o banco (não revela conta nem por tempo) | `services/auth.ts` (`requestEmailCode`) |
| Troca de senha: `sessions_valid_after` + revogação; `refresh` confere o corte **depois** de gravar o token novo (sem corrida) | `services/auth.ts` (`resetPassword`, `refresh`) |
| Produção não sobe sem SMTP (senão o cadastro dispensaria o código) | `config.ts` |

## Status e próximos passos

Ver `docs/DECISOES.md` §Status por tela e §Roadmap do back-end.
