// Number formatting without false precision: "1 017 000 $", percentages with one decimal.

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", AZN: "₼" };

function group(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Money rounded to 3 significant digits for large values (no false precision). */
export function money(v: number | null | undefined, ccy: string, opts: { sign?: boolean; exact?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  let x = v;
  if (!opts.exact && Math.abs(x) >= 1000) {
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(x))) - 2);
    x = Math.round(x / mag) * mag;
  }
  const sign = x < 0 ? "−" : opts.sign && x > 0 ? "+" : "";
  const body = Math.abs(x) < 100 && !Number.isInteger(x) ? Math.abs(x).toFixed(2).replace(".", ",") : group(x);
  return `${sign}${body} ${SYMBOL[ccy] ?? ccy}`;
}

export function price(v: number | null | undefined, ccy?: string): string {
  if (v == null || !isFinite(v)) return "—";
  const s = v >= 1000 ? group(v) : v.toFixed(2).replace(".", ",");
  return ccy ? `${s} ${SYMBOL[ccy] ?? ccy}` : s;
}

export function pct(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return "—";
  const x = Math.round(v * 1000) / 10;
  const sign = x < 0 ? "−" : opts.sign && x > 0 ? "+" : "";
  return `${sign}${Math.abs(x).toFixed(1).replace(".", ",")}%`;
}

/** Probability as a whole percent ("~35%"); extreme values clipped to avoid false certainty. */
export function prob(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  if (v < 0.01) return "<1%";
  if (v > 0.99) return ">99%";
  return `${Math.round(v * 100)}%`;
}

/** Frequency language for a quarterly horizon: 0.05 -> "hər 20 rübdən 1-də". */
export function frequency(p: number): string {
  if (!(p > 0)) return "";
  const n = Math.round(1 / p);
  return `hər ${n} rübdən 1-də`;
}

export function dateAz(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function num(v: number, digits = 4): string {
  return Number(v.toFixed(digits)).toString().replace(".", ",");
}

/** Server timestamps are naive UTC: show them in the viewer's local time, "27.10.2026 14:36". */
export function dateTimeAz(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Whole numbers with a thin group separator: 32374 -> "32 374". */
export function int(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return (v < 0 ? "−" : "") + group(v);
}
