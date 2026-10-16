import { createTransport } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

// SMTP autenticado (Gmail com senha de app, por padrão). P4: o e-mail leva só o
// código — nunca valor, estabelecimento ou cartão.
export function createSmtpMailer(opts: { host: string; port: number; user: string; pass: string; from: string }): Mailer {
  const transport = createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    requireTLS: opts.port !== 465,
    auth: { user: opts.user, pass: opts.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    // A mensagem é só texto montado por nós: nada de anexar arquivo ou buscar URL.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      await transport.sendMail({ from: opts.from, to: message.to, subject: message.subject, text: message.text });
    },
  };
}
