import { ipAddress, rewrite } from '@vercel/functions';

export const config = { matcher: '/v1/:path*' };

export default function middleware(request: Request): Response {
  const environment = process.env.VERCEL_ENV;
  const origin = environment === 'production'
    ? 'https://clivra-api.163-176-182-24.sslip.io'
    : environment === 'preview'
      ? 'https://clivra-api-hml.163-176-182-24.sslip.io'
      : null;
  const proxySecret = environment === 'production'
    ? process.env.CLIVRA_PROXY_SECRET
    : environment === 'preview'
      ? process.env.CLIVRA_PROXY_SECRET_HML
      : undefined;
  const clientIp = ipAddress(request);

  // Uma configuração ausente nunca pode mandar um Preview para produção.
  if (!origin || !proxySecret || !clientIp) {
    return Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Ambiente da API não configurado.' } }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }

  const incoming = new URL(request.url);
  const destination = new URL(origin);
  destination.pathname = incoming.pathname;
  destination.search = incoming.search;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Clivra-Proxy-Secret', proxySecret);
  requestHeaders.set('X-Clivra-Client-Ip', clientIp);
  return rewrite(destination, {
    headers: { 'Cache-Control': 'no-store' },
    request: { headers: requestHeaders },
  });
}
