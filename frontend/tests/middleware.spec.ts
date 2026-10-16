import { test, expect } from '@playwright/test';
import middleware from '../middleware';

test('proxy isola Preview e Production e preserva caminho e query', () => {
  const previous = process.env.VERCEL_ENV;
  try {
    for (const [environment, host] of [['preview', 'clivra-api-hml.163-176-182-24.sslip.io'], ['production', 'clivra-api.163-176-182-24.sslip.io']]) {
      process.env.VERCEL_ENV = environment;
      const response = middleware(new Request('https://app.example/v1/transactions?limit=50&search=test'));
      expect(response.headers.get('x-middleware-rewrite')).toBe(`https://${host}/v1/transactions?limit=50&search=test`);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    delete process.env.VERCEL_ENV;
    expect(middleware(new Request('https://app.example/v1/auth/login')).status).toBe(503);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
