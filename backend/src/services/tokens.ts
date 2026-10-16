import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const issuer = 'clivra';
const audience = 'clivra-api';

export interface VerifiedAccessToken {
  userId: string;
  // Milissegundos desde a época (claim `iat_ms`; o `iat` padrão só tem segundos
  // e deixaria passar um token emitido no mesmo segundo de um corte de sessões).
  issuedAtMs: number;
}

export interface AccessTokens {
  sign(userId: string): Promise<string>;
  verify(token: string): Promise<VerifiedAccessToken | null>;
  ttlSeconds: number;
}

export function createAccessTokens(secret: string, ttlSeconds: number): AccessTokens {
  const key = new TextEncoder().encode(secret);
  return {
    ttlSeconds,
    sign: (userId) =>
      new SignJWT({ iat_ms: Date.now() })
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
        if (typeof payload.sub !== 'string' || typeof payload.iat_ms !== 'number') return null;
        return { userId: payload.sub, issuedAtMs: payload.iat_ms };
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
