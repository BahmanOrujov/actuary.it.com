// Thin fetch wrapper: cookies + CSRF double-submit header.

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)pa_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["x-csrf-token"] = csrfToken();
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string) => request<T>("DELETE", url),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, undefined, form),
};

export interface User {
  id: number;
  email: string;
  role: "client" | "admin";
}

export interface PublicConfig {
  mode: string;
  brand: string;
  currencies: string[];
  default_currency: string;
  csv_import: boolean;
  risk_profiles: Record<string, number>;
  disclaimer: string;
  horizon_days: number;
  csv_notice: string;
}

export interface PortfolioSummary {
  id: number;
  name: string;
  base_currency: string;
  risk_profile: string;
  risk_limit: number | null;
  cash: number;
  version: number;
  n_transactions: number;
  n_instruments: number;
  last_run: null | { id: number; status: string; created_at: string; stale: boolean; reliability: string };
  /** Key numbers of the latest finished run, for the overview card. */
  headline?: null | {
    run_id: number;
    value: number;
    unrealized: number | null;
    unrealized_pct: number | null;
    cvar95: number | null;
    risk_limit: number | null;
    expected_return: number | null;
    range90: [number, number] | null;
    prob_profit: number | null;
    horizon_end: string | null;
  };
}

export interface Instrument {
  id: number;
  investing_symbol: string;
  provider_symbol: string;
  name: string;
  exchange: string;
  currency: string;
}

export interface TxRow {
  id: number;
  side: "BUY" | "SELL";
  quantity: number;
  trade_date: string;
  price: number;
  fees: number;
  currency: string;
  flags: { price_source?: string; date_source?: string; note?: string; warnings?: string[]; price_date_used?: string };
  instrument: Instrument;
}

export interface PortfolioDetail extends PortfolioSummary {
  transactions: TxRow[];
  positions: {
    instrument_id: number;
    investing_symbol: string;
    name: string;
    exchange: string;
    currency: string;
    quantity: number;
    target_price: number | null;
    stop_loss: number | null;
  }[];
}

export interface Candidate {
  provider_symbol: string;
  name: string;
  exchange: string;
  country: string | null;
  currency: string | null;
  currency_inferred?: boolean;
  type: string;
  isin: string | null;
  source?: string;
}

export interface Suggestion {
  investing_symbol: string;
  provider_symbol: string;
  name: string;
  exchange: string;
  currency: string;
}

export interface NotificationItem {
  id: number;
  kind: string;
  message: string;
  portfolio_id: number | null;
  created_at: string;
  read: boolean;
}

export type Reliability = "high" | "medium" | "low" | "checking";

export interface Checkpoint {
  h: number;
  median: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
  pnl_median: number;
  pnl_p05: number;
  pnl_p25: number;
  pnl_p75: number;
  pnl_p95: number;
  prob_loss_vs_today: number;
  prob_profit_vs_cost: number;
  prob_loss_over: Record<string, number>;
}

export interface AssetResult {
  symbol: string;
  investing_symbol: string;
  name: string;
  exchange: string;
  currency: string;
  quantity: number;
  price0: number;
  fx_to_base: number;
  weight: number;
  fan: number[][];
  end: { p05: number; p25: number; median: number; p75: number; p95: number };
  end_q: number[];
  prob_up: number;
  prob_profit: number;
  pnl_end: { p05: number; p25: number; median: number; p75: number; p95: number };
  prob_break_even: number | null;
  cvar_contribution: number;
  cvar_share: number;
  cluster: number;
}

export interface StressItem {
  name: string;
  type: "historical" | "hypothetical";
  pnl_money: number;
  loss_money: number;
  loss_pct: number;
  by_asset: { symbol: string; name: string; return: number; loss_money: number }[];
}

export interface Recommendation {
  kind: string;
  action: "increase" | "reduce" | "hold" | "attention";
  symbol: string | null;
  name: string | null;
  shares: number;
  money: number;
  reason: string;
  cvar_before: number;
  cvar_after: number;
  cvar_before_pct: number;
  cvar_after_pct: number;
  reliability: Reliability;
  disclaimer: string;
  prob_target?: number;
  prob_touch_target?: number;
  prob_touch_stop?: number;
}

export interface RunResult {
  as_of: string;
  horizon_end: string;
  horizon_days: number;
  dates: string[];
  checkpoint_dates: string[];
  base_currency: string;
  current: {
    positions: {
      symbol: string;
      investing_symbol: string;
      name: string;
      quantity: number;
      avg_cost_local: number;
      cost_base: number;
      market_value_base: number;
      unrealized: number;
      unrealized_pct: number;
      realized: number;
      dividends: number;
      total_return: number;
      holding_days: number;
      weight: number;
      currency: string;
      last_close_local: number;
      /** Open purchase lots (FIFO remainder) with current and forecast P&L; absent on older runs. */
      lots?: {
        trade_date: string;
        quantity: number;
        unit_cost_local: number;
        cost_base: number;
        market_value_base: number;
        unrealized: number;
        unrealized_pct: number;
        holding_days: number;
        annualized_return: number | null;
        forecast?: { median: number; p05: number; p95: number; prob_profit: number };
      }[];
    }[];
    closed: { symbol: string; name: string; realized: number; dividends: number }[];
    total: {
      market_value: number;
      cost: number;
      cash: number;
      unrealized: number;
      unrealized_pct: number;
      realized: number;
      dividends: number;
      total_return: number;
    };
  };
  V0: number;
  cost_total: number;
  fan: number[][];
  percentiles: number[];
  history: { dates: string[]; values: number[] };
  sample_paths: number[][];
  checkpoints: Checkpoint[];
  risk: Record<string, { var_pct: number; cvar_pct: number; var_money: number; cvar_money: number }>;
  hidden_99?: boolean;
  pnl_end: {
    median: number;
    p05: number;
    p25: number;
    p75: number;
    p95: number;
    prob_profit: number;
    prob_loss_over: Record<string, number>;
    loss_cvar95_vs_cost: number;
  };
  histogram: { edges: number[]; counts: number[]; below?: number; above?: number };
  drawdown: {
    mdd_percentiles: Record<string, number>;
    exceedance: { x: number; p_drawdown: number; p_touch: number; p_end: number }[];
  };
  assets: AssetResult[];
  correlation: null | { symbols: string[]; names: string[]; matrix: number[][] };
  concentration: { hhi: number; effective_n: number };
  stress: StressItem[];
  sensitivity_zero_drift: { median_value: number; prob_profit: number; var95_pct: number; cvar95_pct: number };
  warnings: string[];
  scenarios: number;
  risk_limit: number;
  insights?: Insights;
  targets:{ symbol: string; target_price: number | null; stop_loss: number | null; prob_target?: number; prob_touch_target?: number; prob_touch_stop?: number }[];
}

export interface RunView {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  step: string;
  progress: number;
  created_at: string;
  finished_at: string | null;
  stale: boolean;
  reliability: Reliability;
  reliability_text: string;
  validation_status: string;
  error: string | null;
  result?: RunResult;
  recommendations?: Recommendation[];
  section_reliability?: { item: string; label: string }[];
  trust?: Trust | null;
  disclaimer?: string;
}

export type Tone = "good" | "warn" | "bad" | "info";
export type Rag = "green" | "amber" | "red" | "none";

export interface MemoItem {
  tone: Tone;
  text: string;
}

export interface Kri {
  key: string;
  label: string;
  value: number | null;
  kind: "pct" | "prob" | "times" | "ratio" | "days";
  status: Rag;
  hint: string;
}

/** CIO / CRO views of a run (backend risk/insights.py). */
export interface Insights {
  investment: {
    memo: MemoItem[];
    metrics: {
      expected_return: number;
      expected_money: number;
      median_return: number;
      range90: [number, number];
      prob_gain: number;
      excess_return: number;
      rf_period: number;
      sharpe: number | null;
      sortino: number | null;
      return_to_cvar: number | null;
      gain_loss_ratio: number | null;
      upside_downside: number | null;
      vol_annual: number;
      market_sensitivity: number;
      systematic_share: number;
      specific_share: number;
      diversification_benefit: number;
      standalone_cvar_sum: number;
      effective_n: number;
      top_weight: number;
      cash_share: number;
      treynor: number | null;
      rachev: number | null;
      prob_beat_rf: number;
      calmar: number | null;
      best_case: number;
      best_case_money: number;
    };
    positions: {
      symbol: string;
      name: string;
      weight: number;
      expected_return: number;
      return_share: number | null;
      risk_share: number;
      efficiency: number | null;
      class: "efficient" | "balanced" | "costly" | "hedge";
      market_sensitivity: number;
      specific_risk_share: number;
      vol_now: number;
      standalone_cvar_pct: number;
    }[];
    exposure: { currency: { key: string; weight: number }[]; exchange: { key: string; weight: number }[] };
  };
  risk: {
    memo: MemoItem[];
    kri: Kri[];
    metrics: {
      cvar95: number;
      var95: number;
      limit: number;
      limit_use: number | null;
      headroom_money: number | null;
      beyond_limit: number | null;
      vol_now: number;
      vol_long: number;
      vol_regime: number | null;
      corr_now: number | null;
      corr_long: number | null;
      corr_pair: { a: string; b: string; value: number } | null;
      top3_risk: number;
      skewness: number | null;
      excess_kurtosis: number | null;
      semidev_annual: number;
      prob_loss: number;
      worst_case: number | null;
    };
    /** Horizon-return quantiles at p = 0.001 ... 0.999; null below the hidden tail when the model is unreliable. */
    quantiles?: (number | null)[];
    assets: { symbol: string; now: number; long: number; ratio: number | null; liquidity_days: number | null }[];
  };
}

/** Plain track record of the model on past data (observed vs expected); no test statistics. */
export interface Trust {
  backtest_days: number;
  backtest_months: number;
  history_years: number;
  windows_3m: number;
  var95: { observed: number; expected: number } | null;
  var99: { observed: number; expected: number } | null;
  cover50: { nominal: number; observed: number; independent_windows: number } | null;
  cover90: { nominal: number; observed: number; independent_windows: number } | null;
  checks_passed: number;
  checks_total: number;
  fallback_model: boolean;
  mc_rel_error: number | null;
  scenarios: number;
}
