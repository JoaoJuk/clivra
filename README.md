# CLIVRA

**PWA de controle de gastos de cartão** — registra compras, categoriza automaticamente, aprende regras a cada confirmação e mostra dashboards por categoria, cartão e mês. Instalável no celular (tela inicial), funciona offline e está em produção.

🔗 **App em produção:** https://clivra-puce.vercel.app

---

## Funcionalidades

- 📥 Lançamento de compras por texto colado, atalho do iOS ou manual
- 🏷️ Categorização automática com aprendizado de regras (pergunta uma vez, memoriza)
- 📊 Dashboards por categoria, cartão e mês
- 📱 PWA instalável e tolerante a offline
- 🔐 Autenticação segura (JWT em cookie HttpOnly + hashing Argon2)

## Stack

**Front-end:** React · TypeScript · Vite · TailwindCSS · TanStack Query · Recharts · PWA (Workbox)
**Back-end:** Node.js · TypeScript · Fastify · Drizzle ORM · PostgreSQL · Zod
**Segurança:** JWT (jose) · Argon2 · Helmet · CORS · Rate limit
**Infra:** Front na Vercel · API em VPS

## Arquitetura

```
┌─────────────┐      ┌──────────────────────┐      ┌──────────────┐
│  PWA (React) │ ───▶ │  API (Node + Fastify) │ ───▶ │  PostgreSQL  │
│  Vercel      │      │  auth · ingest · regras│      │  (Drizzle)   │
└─────────────┘      └──────────────────────┘      └──────────────┘
```

- `frontend/` — aplicação React/Vite (PWA)
- `backend/`  — API Fastify + Drizzle ORM
- `docs/`     — contrato da API e decisões de arquitetura

## Como rodar

```bash
# Back-end
cd backend && npm install && cp .env.example .env && npm run dev   # http://localhost:3333

# Front-end
cd frontend && npm install && cp .env.example .env && npm run dev   # http://localhost:5173
```

---

Projeto pessoal desenvolvido por [João Vitor Juk Lopes](https://github.com/JoaoJuk).
