// Limite de tentativas erradas por conta (e-mail), independente do IP.
// Complementa o rate limit por IP: atrás de proxy o IP pode ser forjado via
// X-Forwarded-For por quem chamar a VPS direto, mas o limite por conta não.
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    // Teto de chaves em memória: um flood de e-mails aleatórios não esgota a RAM.
    private readonly maxKeys = 10_000,
  ) {}

  // Segundos até liberar, ou null se não está bloqueado.
  blockedForSeconds(key: string, now = Date.now()): number | null {
    const list = this.recent(key, now);
    if (list.length < this.maxFailures) return null;
    const releaseAt = (list[list.length - this.maxFailures] ?? now) + this.windowMs;
    return Math.max(1, Math.ceil((releaseAt - now) / 1000));
  }

  recordFailure(key: string, now = Date.now()): void {
    const list = this.recent(key, now);
    list.push(now);
    this.failures.delete(key);
    this.failures.set(key, list);
    // Map guarda ordem de inserção: a primeira chave é a mais antiga.
    if (this.failures.size > this.maxKeys) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (list.length === 0) this.failures.delete(key);
    return list;
  }
}
