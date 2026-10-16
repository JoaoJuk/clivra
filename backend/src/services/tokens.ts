import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const issuer = 'clivra';
const audience = 'clivra-api';

export interface AccessTokens {
  sign(userId: string): Promise<string>;
  verify(token: string): Promise<string | null>;
  ttlSeconds: number;
}

export function createAccessTokens(secret: string, ttlSeconds: number): AccessTokens {
  const key = new TextEncoder().encode(secret);
  return {
    ttlSeconds,
    sign: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key),
    verify: async (token) => {
      try {
        // Algoritmo fixo: impede ataques de "alg: none" ou troca de algoritmo.
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer, audience });
        return typeof payload.sub === 'string' ? payload.sub : null;
      } catch {
        return null;
      }
    },
  };
}

// Refresh token opaco de 256 bits; no banco só fica o hash.
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
