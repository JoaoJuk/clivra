import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/client.js';
import {
  claimActiveEmailCodes,
  consumeEmailCode,
  deleteEmailCodesBefore,
  insertEmailCodeIfAllowed,
} from '../db/email-codes.js';
import type { EmailCodePurpose } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import type { Mailer } from './mailer.js';

export const EMAIL_CODE_TTL_SECONDS = 10 * 60;
export const EMAIL_CODE_RESEND_SECONDS = 60;
const MAX_ATTEMPTS_PER_CODE = 5;
// Por e-mail e finalidade, em 24 h. Cada tentativa gasta 1 das 5 de cada código
// válido, então o total de chutes fica em torno de 25 por dia num espaço de
// 1 milhão de códigos.
const MAX_CODES_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const subjects: Record<EmailCodePurpose, string> = {
  register: 'Seu código para criar a conta no Clivra',
  password_reset: 'Seu código para redefinir a senha do Clivra',
};

const actions: Record<EmailCodePurpose, string> = {
  register: 'criar sua conta',
  password_reset: 'redefinir sua senha',
};

export function createEmailCodeService(deps: {
  db: Db;
  mailer: Mailer;
  secret: Buffer;
  // Falha em segundo plano vai para o log (sem destinatário nem código — P4).
  onBackgroundError: (error: unknown) => void;
}) {
  const { db, mailer } = deps;

  // HMAC com segredo do servidor e ligado ao e-mail/finalidade: com só 10^6
  // códigos possíveis, um SHA-256 puro seria revertido na hora se o banco vazasse.
  function hashCode(email: string, purpose: EmailCodePurpose, code: string): Buffer {
    return createHmac('sha256', deps.secret).update(`email-code\0${purpose}\0${email}\0${code}`).digest();
  }

  // Gera e envia um código. Pedido cedo demais ou acima do teto diário é
  // ignorado em silêncio (resposta igual), para não revelar nada a quem chama.
  // Um pedido novo NÃO invalida o anterior: todos chegam na caixa do dono, então
  // quem pede códigos em nome dele não consegue travar a recuperação.
  async function issue(email: string, purpose: EmailCodePurpose): Promise<void> {
    const now = new Date();
    await deleteEmailCodesBefore(db, new Date(now.getTime() - 2 * DAY_MS));

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const inserted = await insertEmailCodeIfAllowed(
      db,
      {
        id: newId(),
        email,
        purpose,
        codeHash: hashCode(email, purpose, code).toString('base64url'),
        expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_SECONDS * 1000),
      },
      {
        now,
        resendAfter: new Date(now.getTime() - EMAIL_CODE_RESEND_SECONDS * 1000),
        daySince: new Date(now.getTime() - DAY_MS),
        maxPerDay: MAX_CODES_PER_DAY,
      },
    );
    if (!inserted) return;

    // A resposta não espera o SMTP.
    mailer
      .send({
        to: email,
        subject: subjects[purpose],
        text:
          `Seu código é ${code}\n\n` +
          `Use-o para ${actions[purpose]}. Ele vale por ${EMAIL_CODE_TTL_SECONDS / 60} minutos.\n\n` +
          'Se não foi você, ignore este e-mail.\n',
      })
      .catch(deps.onBackgroundError);
  }

  return {
    issue,

    // Roda `shouldSend` e `issue` depois de responder: o tempo de resposta não
    // denuncia se a conta existe (usado no "esqueci a senha").
    issueInBackground(email: string, purpose: EmailCodePurpose, shouldSend: () => Promise<boolean>): void {
      void (async () => {
        if (await shouldSend()) await issue(email, purpose);
      })().catch(deps.onBackgroundError);
    },

    // Confere e consome o código. Qualquer falha dá o mesmo erro.
    async consume(email: string, purpose: EmailCodePurpose, code: string): Promise<void> {
      const now = new Date();
      const claimed = await claimActiveEmailCodes(db, email, purpose, now, MAX_ATTEMPTS_PER_CODE);
      const given = hashCode(email, purpose, code);
      let matchId: string | undefined;
      for (const row of claimed) {
        const expected = Buffer.from(row.codeHash, 'base64url');
        if (expected.length === given.length && timingSafeEqual(expected, given)) matchId = row.id;
      }
      if (!matchId || !(await consumeEmailCode(db, matchId, email, purpose, now))) throw errors.invalidEmailCode();
    },
  };
}

export type EmailCodeService = ReturnType<typeof createEmailCodeService>;
