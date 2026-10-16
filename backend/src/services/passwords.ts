import { hash, verify } from '@node-rs/argon2';

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, t=2, p=1).
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Usado quando o e-mail não existe: gasta o mesmo tempo de uma verificação real,
// para o tempo de resposta não revelar se o e-mail está cadastrado.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('clivra-dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
