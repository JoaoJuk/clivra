import { test, expect } from '@playwright/test';
import middleware from '../middleware';

test('proxy isola Preview e Production e preserva caminho e query', () => {
  const previous = {
    environment: process.env.VERCEL_ENV,
    productionSecret: process.env.CLIVRA_PROXY_SECRET,
    previewSecret: process.env.CLIVRA_PROXY_SECRET_HML,
  };
  try {
    process.env.CLIVRA_PROXY_SECRET = 'production-secret';
    process.env.CLIVRA_PROXY_SECRET_HML = 'preview-secret';
    for (const [environment, host, secret] of [
      ['preview', 'clivra-api-hml.163-176-182-24.sslip.io', 'preview-secret'],
      ['production', 'clivra-api.163-176-182-24.sslip.io', 'production-secret'],
    ]) {
      process.env.VERCEL_ENV = environment;
      const response = middleware(new Request('https://app.example/v1/transactions?limit=50&search=test', { headers: {
        'x-real-ip': '203.0.113.42',
        'x-clivra-proxy-secret': 'client-forged-secret',
        'x-clivra-client-ip': '198.51.100.10',
      } }));
      expect(response.headers.get('x-middleware-rewrite')).toBe(`https://${host}/v1/transactions?limit=50&search=test`);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-middleware-request-x-clivra-proxy-secret')).toBe(secret);
      expect(response.headers.get('x-middleware-request-x-clivra-client-ip')).toBe('203.0.113.42');
    }
    delete process.env.CLIVRA_PROXY_SECRET_HML;
    process.env.VERCEL_ENV = 'preview';
    expect(middleware(new Request('https://app.example/v1/auth/login')).status).toBe(503);
  } finally {
    for (const [key, value] of [
      ['VERCEL_ENV', previous.environment],
      ['CLIVRA_PROXY_SECRET', previous.productionSecret],
      ['CLIVRA_PROXY_SECRET_HML', previous.previewSecret],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
