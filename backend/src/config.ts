import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

// false | número de saltos de proxy | lista de IPs/CIDRs confiáveis.
// "true" (confiar em qualquer X-Forwarded-For) não é aceito: deixaria o IP forjável.
const trustProxy = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const raw = (value ?? '').trim();
    if (raw === '' || raw === 'false' || raw === '0') return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    if (raw === 'true') {
      ctx.addIssue({ code: 'custom', message: 'use o número de proxies (ex.: 2) ou a lista de IPs, não "true"' });
      return z.NEVER;
    }
    return raw.split(',').map((ip) => ip.trim()).filter(Boolean);
  });

const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z.string().optional().transform((value) => value || undefined),
  PGLITE_DIR: z.string().default('./.pgdata'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres.'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
  COOKIE_SECURE: booleanFlag,
  TRUST_PROXY: trustProxy,
  // Código exigido para criar a conta do dono. Em produção, sem ele, o cadastro
  // fica fechado — ninguém da internet vira dono antes de você.
  OWNER_SETUP_CODE: z
    .string()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().min(16, 'OWNER_SETUP_CODE precisa ter pelo menos 16 caracteres.').optional()),
  // E-mail (código de cadastro e "esqueci a senha"). Sem SMTP_USER/SMTP_PASS o
  // envio fica desligado. Gmail: senha de app, não a senha da conta.
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().optional().transform((value) => value || undefined).pipe(z.email().optional()),
  SMTP_PASS: z.string().optional().transform((value) => value || undefined),
  MAIL_FROM: z.string().optional().transform((value) => value || undefined),
  // Endereço do app citado no e-mail de convite (opcional).
  APP_URL: z.string().optional().transform((value) => value || undefined).pipe(z.url({ protocol: /^https?$/ }).optional()),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Configuração inválida no .env:\n${problems}`);
  }

  const config = parsed.data;
  if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASS)) {
    throw new Error('Configuração inválida no .env: preencha SMTP_USER e SMTP_PASS juntos (ou nenhum dos dois).');
  }
  if (config.NODE_ENV === 'production') {
    if (!config.COOKIE_SECURE) throw new Error('Em produção, COOKIE_SECURE precisa ser true.');
    if (!config.DATABASE_URL) throw new Error('Em produção, DATABASE_URL é obrigatório (PGlite é só para dev).');
    // A porta do Node só escuta local; quem fala com a internet é o Caddy.
    if (!loopbackHosts.has(config.HOST)) throw new Error('Em produção, HOST precisa ser 127.0.0.1 (atrás do Caddy).');
    // Sem SMTP o cadastro dispensaria o código de e-mail: falha fechado.
    if (!config.SMTP_USER) throw new Error('Em produção, SMTP_USER e SMTP_PASS são obrigatórios.');
  }
  return config;
}
