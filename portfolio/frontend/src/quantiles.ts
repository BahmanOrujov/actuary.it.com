// VaR / CVaR at any confidence level and loss probabilities from the run's horizon-return quantile grid
// (p = 0.001 ... 0.999). Linear interpolation between grid points; nothing is extrapolated beyond the grid.

export type Grid = (number | null)[];

const STEP = 0.001;

/** Lowest probability level the grid still covers (higher when the model's extreme tail is hidden). */
export function minP(q: Grid): number {
  const i = q.findIndex((v) => v != null);
  return i < 0 ? 1 : (i + 1) * STEP;
}

/** Highest confidence level (e.g. 0.98) for which VaR/CVaR can be shown. */
export function maxLevel(q: Grid): number {
  return Math.round((1 - minP(q)) * 1000) / 1000;
}

/** Return quantile at probability p. */
export function quantile(q: Grid, p: number): number | null {
  const x = p / STEP - 1;
  if (x < 0 || x > q.length - 1) return null;
  const i = Math.floor(x);
  const a = q[i];
  const b = q[Math.min(i + 1, q.length - 1)];
  if (a == null || b == null) return null;
  return a + (b - a) * (x - i);
}

/** VaR and CVaR (positive = loss, fraction of value) at confidence level 0.5 < level < 1. */
export function varCvar(q: Grid, level: number): { var: number; cvar: number } | null {
  const p = 1 - level;
  const v = quantile(q, p);
  if (v == null) return null;
  // CVaR = mean of the quantiles in the tail below p (each grid point stands for STEP of probability)
  const tail: number[] = [];
  for (let i = 0; (i + 1) * STEP <= p + 1e-9; i++) {
    const x = q[i];
    if (x == null) return null;
    tail.push(x);
  }
  const cvar = tail.length ? -tail.reduce((s, x) => s + x, 0) / tail.length : -v;
  return { var: -v, cvar: Math.max(cvar, -v) };
}

/** P(return <= x); bound marks the grid edges ("<0.1%" / ">99.9%"). */
export function probBelow(q: Grid, x: number): { p: number; bound: "lt" | "gt" | null } | null {
  const lo = minP(q);
  const first = quantile(q, lo);
  const last = q[q.length - 1];
  if (first == null || last == null) return null;
  if (x < first) return lo <= STEP ? { p: STEP, bound: "lt" } : null;  // hidden tail: unknown
  if (x >= last) return { p: 1 - STEP, bound: "gt" };
  for (let i = Math.round(lo / STEP) - 1; i < q.length - 1; i++) {
    const a = q[i] as number;
    const b = q[i + 1] as number;
    if (x <= b) {
      const f = b > a ? (x - a) / (b - a) : 0;
      return { p: (i + 1 + f) * STEP, bound: null };
    }
  }
  return { p: 1 - STEP, bound: "gt" };
}
