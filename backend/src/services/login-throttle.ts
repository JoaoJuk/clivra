// Limite de tentativas erradas por conta (e-mail), independente do IP.
// Complementa o rate limit por IP: atrás de proxy o IP pode ser forjado via
// X-Forwarded-For por quem chamar a VPS direto, mas o limite por conta não.
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    const list = this.recent(key, now);
    list.push(now);
    this.failures.set(key, list);
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
