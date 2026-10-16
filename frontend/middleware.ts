import { rewrite } from '@vercel/functions';

export const config = { matcher: '/v1/:path*' };

export default function middleware(request: Request): Response {
  const environment = process.env.VERCEL_ENV;
  const origin = environment === 'production'
    ? 'https://clivra-api.163-176-182-24.sslip.io'
    : environment === 'preview'
      ? 'https://clivra-api-hml.163-176-182-24.sslip.io'
      : null;

  // Uma configuração ausente nunca pode mandar um Preview para produção.
  if (!origin) {
    return Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Ambiente da API não configurado.' } }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }

  const incoming = new URL(request.url);
  const destination = new URL(origin);
  destination.pathname = incoming.pathname;
  destination.search = incoming.search;
  return rewrite(destination, { headers: { 'Cache-Control': 'no-store' } });
}
