import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Candidate, Headline, PortfolioDetail, WhatIfTrade, WhatIfView } from "../api";
import { dateTimeAz, money, pct, prob } from "../format";
import { Key, STEP_ORDER, t } from "../i18n";
import { L, LANG } from "../lang";
import { usePortfolio } from "./PortfolioLayout";

interface Draft extends WhatIfTrade {
  label: string;
}

/** "What if I sold X and bought Y?": the same analysis on a hidden copy of the portfolio, next to the real one.
 *  One scenario serves both views: "today" compares the past measures, "forecast" the model's. */
export default function WhatIfPage({ basis = "model" }: { basis?: "model" | "history" }) {
  const { id } = useParams();
  const pid = Number(id);
  const { summary } = usePortfolio();
  const [detail, setDetail] = useState<PortfolioDetail | null>(null);
  const [view, setView] = useState<WhatIfView | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    const v = await api.get<WhatIfView | null>(`/api/portfolios/${pid}/whatif`).catch(() => null);
    setView(v);
    if (v?.run && (v.run.status === "queued" || v.run.status === "running")) timer.current = window.setTimeout(load, 1500);
  }, [pid]);

  useEffect(() => {
    api.get<PortfolioDetail>(`/api/portfolios/${pid}`).then(setDetail).catch(() => {});
    setDrafts([]);
    load();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [pid, load]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const v = await api.post<WhatIfView>(`/api/portfolios/${pid}/whatif`, {
        trades: drafts.map(({ label: _label, ...tr }) => tr),
      });
      setWarnings(v.warnings ?? []);
      setDrafts([]);
      setView(v);
      timer.current = window.setTimeout(load, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    await api.del(`/api/portfolios/${pid}/whatif`).catch(() => {});
    setWarnings([]);
    load();
  }

  const computing = !!view?.run && (view.run.status === "queued" || view.run.status === "running");
  const ccy = summary.base_currency;

  return (
    <>
      <section className="card">
        <div className="card-head" style={{ marginBottom: 6 }}>
          <div>
            <h2>{L("Nə olardı?", "What if?")}</h2>
            <div className="sub">
              {basis === "history"
                ? L("Hipotetik alış və satışları sınayın: dəyişdirilmiş portfel keçmişdə necə gəlir gətirər və nə qədər itirərdi? Əsl portfeliniz dəyişmir.",
                  "Try hypothetical buys and sells: how would the changed portfolio have earned and how much would it have lost in the past? Your real portfolio is not changed.")
                : L("Hipotetik alış və satışları sınayın: portfelin gözlənilən gəliri və riski necə dəyişərdi? Əsl portfeliniz dəyişmir.",
                  "Try hypothetical buys and sells: how would the expected return and the risk of the portfolio change? Your real portfolio is not changed.")}
            </div>
          </div>
        </div>
        <TradeForm pid={pid} detail={detail} onAdd={(d) => setDrafts((xs) => [...xs, d])} />
        {drafts.length > 0 && (
          <>
            <div className="whatif-trades">
              {drafts.map((d, i) => (
                <div className="trade" key={i}>
                  <span className={`badge ${d.side === "BUY" ? "ok" : "warn"}`}>{d.side === "BUY" ? t("buy") : t("sell")}</span>
                  <b>{d.quantity}</b> × <span className="ticker">{d.label}</span>
                  <button className="link x" onClick={() => setDrafts((xs) => xs.filter((_, j) => j !== i))}>{t("delete")}</button>
                </div>
              ))}
            </div>
            <button className="primary" onClick={run} disabled={busy || computing}>
              {busy ? L("Hazırlanır…", "Preparing…") : L("Ssenarini hesabla", "Analyse the scenario")}
            </button>
          </>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          {L("Əməliyyatlar bugünkü son qiymətlə, komissiyasız tətbiq olunur. Satışdan gələn pul nağd pula əlavə olunmur, alış üçün əlavə pul qoyulduğu fərz edilir; ona görə faizlərlə müqayisə edin.",
            "Trades are applied at today's latest price, without fees. Sale proceeds are not added to cash and purchases are assumed to use new money, so compare the percentages.")}
        </p>
        {error && <div className="banner err" role="alert">✕ {error}</div>}
        {warnings.map((w) => <div key={w} className="banner warn"><span className="ic">⚠</span> {w}</div>)}
      </section>

      {view === undefined ? <div className="muted">{L("Yüklənir…", "Loading…")}</div> : view && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{L("Son ssenari", "Latest scenario")}</h2>
              <div className="sub">
                {dateTimeAz(view.created_at)} ·{" "}
                {view.trades.map((tr) => `${tr.side === "BUY" ? "+" : "−"}${tr.quantity} ${tr.investing_symbol || tr.provider_symbol}`).join(", ")}
              </div>
            </div>
            <button onClick={discard}>{L("Ssenarini sil", "Discard scenario")}</button>
          </div>
          {view.outdated && (
            <div className="banner warn"><span className="ic">⚠</span>
              {L("Portfel bu ssenaridən sonra dəyişib. Müqayisə üçün ssenarini yenidən hesablayın.",
                "The portfolio changed after this scenario. Analyse the scenario again to compare.")}
            </div>
          )}
          {computing && view.run && (
            <p className="muted">
              {L("Hesablanır", "Analysing")} · {Math.round(view.run.progress * 100)}% ·{" "}
              {STEP_ORDER.includes(view.run.step as (typeof STEP_ORDER)[number]) ? t(`steps_${view.run.step}` as Key) : ""}
            </p>
          )}
          {view.run?.status === "failed" && <div className="banner err">✕ {view.run.error}</div>}
          {view.run?.status === "done" && (basis === "history"
            ? <ComparePast base={view.base} scen={view.scenario} ccy={ccy} />
            : <Compare base={view.base} scen={view.scenario} ccy={ccy} />)}
        </section>
      )}
    </>
  );
}

function TradeForm({ pid, detail, onAdd }: { pid: number; detail: PortfolioDetail | null; onAdd: (d: Draft) => void }) {
  const [q, setQ] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("SELL");
  const [qty, setQty] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const held = detail?.positions ?? [];

  // a held position is resolved without a search: its listing is already known
  const heldListing = (sym: string) => {
    const tx = detail?.transactions.find((x) => x.instrument.investing_symbol.toUpperCase() === sym.toUpperCase());
    return tx ? { provider_symbol: tx.instrument.provider_symbol, investing_symbol: tx.instrument.investing_symbol } : null;
  };

  function add(provider_symbol: string, investing_symbol: string) {
    const quantity = Number(qty.replace(",", "."));
    onAdd({ provider_symbol, investing_symbol, side, quantity, label: investing_symbol });
    setQ("");
    setQty("");
    setCands(null);
    setMsg(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const sym = q.trim();
    if (!sym || !(Number(qty.replace(",", ".")) > 0)) return;
    const h = heldListing(sym);
    if (h) return add(h.provider_symbol, h.investing_symbol);
    try {
      const r = await api.get<{ candidates: Candidate[]; auto_select: boolean; message: string | null }>(
        `/api/symbols/search?q=${encodeURIComponent(sym)}`,
      );
      if (r.candidates.length === 1 || (r.auto_select && r.candidates.length)) return add(r.candidates[0].provider_symbol, sym.toUpperCase());
      setCands(r.candidates);
      setMsg(r.message ?? (r.candidates.length ? null : L("Simvol tapılmadı.", "Symbol not found.")));
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <>
      <form className="form-grid" onSubmit={submit} aria-label={L("Hipotetik əməliyyat", "Hypothetical trade")} data-pid={pid}>
        <label>
          {t("side")}
          <select value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}>
            <option value="SELL">{t("sell")}</option>
            <option value="BUY">{t("buy")}</option>
          </select>
        </label>
        <label>
          {L("Simvol", "Symbol")}
          <input value={q} onChange={(e) => setQ(e.target.value)} list="whatif-held" placeholder="AAPL, SAP…" maxLength={32} autoComplete="off" />
          <datalist id="whatif-held">
            {held.map((p) => <option key={p.instrument_id} value={p.investing_symbol}>{`${p.name} · ${p.quantity}`}</option>)}
          </datalist>
        </label>
        <label>
          {t("quantity")}
          <input required inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <button type="submit" disabled={!q.trim() || !qty}>{L("Siyahıya əlavə et", "Add to the list")}</button>
      </form>
      {msg && <p className="muted small">{msg}</p>}
      {cands && cands.length > 1 && (
        <div className="candidates" role="listbox" aria-label={L("Namizədlər", "Candidates")}>
          {cands.map((c) => (
            <button key={c.provider_symbol} role="option" aria-selected={false} onClick={() => add(c.provider_symbol, q.trim().toUpperCase())}>
              <b>{c.provider_symbol}</b> — {c.name} · {c.exchange}{c.currency ? ` · ${c.currency}` : ""}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** A change of a percentage in percentage points: 0.0062 -> "−0,62 f.b." / "−0.62 p.p.". */
function points(d: number, digits: number): string {
  const s = Math.abs(d * 100).toFixed(digits);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${LANG === "az" ? s.replace(".", ",") : s} ${L("f.b.", "p.p.")}`;
}

function Compare({ base, scen, ccy }: { base: Headline | null; scen: Headline | null; ccy: string }) {
  if (!scen) return null;
  if (!base) {
    return (
      <div className="banner info"><span className="ic">ℹ</span>
        {L("Müqayisə üçün əvvəlcə əsl portfel üçün Generate basın.", "To compare, run Generate for the real portfolio first.")}
      </div>
    );
  }
  // higher is better for return and profit probability; lower is better for the tail risk
  const rows: { label: string; a: number | null; b: number | null; fmt: (v: number | null) => string; higherBetter: boolean | null }[] = [
    { label: L("Portfelin dəyəri", "Portfolio value"), a: base.value, b: scen.value, fmt: (v) => money(v, ccy), higherBetter: null },
    { label: L("Gözlənilən gəlir (3 ay)", "Expected return (3 months)"), a: base.expected_return, b: scen.expected_return, fmt: (v) => pct(v, { sign: true }), higherBetter: true },
    { label: L("Mənfəətdə bitmə ehtimalı", "Probability of ending in profit"), a: base.prob_profit, b: scen.prob_profit, fmt: prob, higherBetter: true },
    { label: L("Pis halda itki (CVaR 95%)", "Bad-case loss (CVaR 95%)"), a: base.cvar95, b: scen.cvar95, fmt: (v) => pct(v), higherBetter: false },
  ];
  const range = (h: Headline) => (h.range90 ? `${pct(h.range90[0], { sign: true })} … ${pct(h.range90[1], { sign: true })}` : "—");
  return (
    <>
      <table className="compare">
        <thead>
          <tr><th /><th className="num">{L("İndiki portfel", "Current portfolio")}</th><th className="num">{L("Ssenari", "Scenario")}</th><th className="num">{L("Fərq", "Change")}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.a != null && r.b != null ? r.b - r.a : null;
            const tone = d == null || r.higherBetter == null || Math.abs(d) < 1e-9 ? "" : (d > 0) === r.higherBetter ? "better" : "worse";
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{r.fmt(r.a)}</td>
                <td className="num">{r.fmt(r.b)}</td>
                <td className={`num ${tone}`}>{d == null ? "—" : r.higherBetter == null ? money(d, ccy, { sign: true }) : points(d, r.fmt === prob ? 1 : 2)}</td>
              </tr>
            );
          })}
          <tr>
            <td>{L("10 ssenaridən 9-u bu aralıqda", "9 in 10 outcomes in this range")}</td>
            <td className="num">{range(base)}</td>
            <td className="num">{range(scen)}</td>
            <td />
          </tr>
          {scen.risk_limit != null && (
            <tr>
              <td>{L("Risk limiti", "Risk limit")}</td>
              <td className="num">{base.cvar95 != null ? (base.cvar95 <= (base.risk_limit ?? Infinity) ? "✓" : "✕") : "—"} {pct(base.risk_limit)}</td>
              <td className="num">{scen.cvar95 != null ? (scen.cvar95 <= scen.risk_limit ? "✓" : "✕") : "—"} {pct(scen.risk_limit)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8 }}>
        {L("Yaşıl — ssenari bu göstəricidə daha yaxşıdır, qırmızı — daha pisdir. Bu, məsləhət deyil; qərarı siz verirsiniz.",
          "Green — the scenario is better on this measure, red — worse. This is not advice; the decision is yours.")}
      </p>
    </>
  );
}

/** The scenario against the real portfolio on past prices: what each would have earned and lost. */
function ComparePast({ base, scen, ccy }: { base: Headline | null; scen: Headline | null; ccy: string }) {
  if (!scen) return null;
  const a = base?.actual;
  const b = scen.actual;
  if (!base || !a || !b) {
    return (
      <div className="banner info"><span className="ic">ℹ</span>
        {L("Müqayisə üçün əsl portfel üçün Generate basın, sonra ssenarini yenidən hesablayın.", "To compare, run Generate for the real portfolio, then analyse the scenario again.")}
      </div>
    );
  }
  // percentages compare like for like; lower is better for the losses and the swings
  const rows: { label: string; a: number | null | undefined; b: number | null | undefined; higherBetter: boolean | null; loss?: boolean; plain?: boolean }[] = [
    { label: L("Son 3 ay gəlir", "Last 3 months' return"), a: a.return_period, b: b.return_period, higherBetter: true },
    { label: L("Son 1 il gəlir", "Last year's return"), a: a.return_year, b: b.return_year, higherBetter: true },
    { label: L("Dəyişkənlik (illik)", "Volatility (annual)"), a: a.vol_annual, b: b.vol_annual, higherBetter: false, plain: true },
    { label: L("Pis 3 ay (CVaR 95%)", "A bad 3 months (CVaR 95%)"), a: a.cvar95_pct, b: b.cvar95_pct, higherBetter: false, loss: true },
    { label: L("Ən böyük düşüş (1 il)", "Largest fall (1 year)"), a: a.max_drawdown, b: b.max_drawdown, higherBetter: true },
  ];
  const show = (v: number | null | undefined, loss?: boolean, plain?: boolean) => (v == null ? "—" : loss ? pct(-v) : pct(v, { sign: !plain }));
  return (
    <>
      <table className="compare">
        <thead>
          <tr><th /><th className="num">{L("İndiki portfel", "Current portfolio")}</th><th className="num">{L("Ssenari", "Scenario")}</th><th className="num">{L("Fərq", "Change")}</th></tr>
        </thead>
        <tbody>
          <tr><td>{L("Portfelin dəyəri", "Portfolio value")}</td><td className="num">{money(base.value, ccy)}</td><td className="num">{money(scen.value, ccy)}</td><td className="num">{money(scen.value - base.value, ccy, { sign: true })}</td></tr>
          {rows.map((r) => {
            const d = r.a != null && r.b != null ? r.b - r.a : null;
            const tone = d == null || r.higherBetter == null || Math.abs(d) < 1e-9 ? "" : (d > 0) === r.higherBetter ? "better" : "worse";
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{show(r.a, r.loss, r.plain)}</td>
                <td className="num">{show(r.b, r.loss, r.plain)}</td>
                <td className={`num ${tone}`}>{d == null ? "—" : points(r.loss ? -d : d, 2)}</td>
              </tr>
            );
          })}
          {scen.risk_limit != null && (
            <tr>
              <td>{L("Risk limiti", "Risk limit")}</td>
              <td className="num">{a.cvar95_pct != null ? (a.cvar95_pct <= (base.risk_limit ?? Infinity) ? "✓" : "✕") : "—"} {pct(base.risk_limit)}</td>
              <td className="num">{b.cvar95_pct != null ? (b.cvar95_pct <= scen.risk_limit ? "✓" : "✕") : "—"} {pct(scen.risk_limit)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8 }}>
        {L("Hər iki portfel eyni keçmiş qiymətlərlə ölçülür. Yaşıl — ssenari keçmişdə daha yaxşı olardı, qırmızı — daha pis. Keçmiş gələcəyə zəmanət deyil; qərarı siz verirsiniz.",
          "Both portfolios are measured on the same past prices. Green — the scenario would have done better, red — worse. The past is no guarantee; the decision is yours.")}
      </p>
    </>
  );
}
