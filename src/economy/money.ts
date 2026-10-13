// Indian Rupee helpers. All money is stored as integer paise to avoid floating point drift.

export type Paise = number;

export const rupees = (r: number): Paise => Math.round(r * 100);
export const toRupees = (p: Paise) => p / 100;

/** Group digits Indian-style: 1234567 -> "12,34,567". */
export function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  let rest = intStr.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(',') + ',' + last3;
}

/**
 * Format paise as INR. Paise digits are shown only when non-zero (or when forced).
 * formatINR(rupees(100000)) === "₹1,00,000"
 */
export function formatINR(p: Paise, opts: { paise?: boolean; sign?: boolean } = {}): string {
  const neg = p < 0;
  const abs = Math.abs(Math.round(p));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let s = '₹' + groupIndian(String(whole));
  if (opts.paise || frac !== 0) s += '.' + String(frac).padStart(2, '0');
  if (neg) return '-' + s;
  if (opts.sign && abs > 0) return '+' + s;
  return s;
}

/** Short form for large values: ₹4.85 lakh, ₹1.2 crore. */
export function formatINRShort(p: Paise): string {
  const r = Math.abs(p) / 100;
  const sign = p < 0 ? '-' : '';
  if (r >= 1e7) return `${sign}₹${trim(r / 1e7)} crore`;
  if (r >= 1e5) return `${sign}₹${trim(r / 1e5)} lakh`;
  return formatINR(p);
}

const trim = (n: number) => (Math.round(n * 100) / 100).toString();
