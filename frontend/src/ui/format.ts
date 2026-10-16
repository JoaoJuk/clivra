const integerFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "short",
});

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function formatMoney(amountCents: number): string {
  const absolute = Math.abs(amountCents);
  const whole = Math.floor(absolute / 100);
  const cents = absolute % 100;
  return `${amountCents < 0 ? "−" : ""}R$\u00a0${integerFormatter.format(whole)},${String(cents).padStart(2, "0")}`;
}

export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function formatLongDate(value: string): string {
  return longDateFormatter.format(new Date(value));
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

/** Converte entrada em reais para centavos sem usar ponto flutuante no cálculo. */
export function parseMoneyInput(value: string): number | null {
  const raw = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw) ? raw.replace(/\./g, "") : raw;
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(/[,.]/);
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function localDateTimeInputValue(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

export function saoPauloDateTimeToUtc(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Data e hora inválidas.");
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  let candidate = target;
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const projected = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    candidate += target - projected;
  }
  return new Date(candidate).toISOString();
}
