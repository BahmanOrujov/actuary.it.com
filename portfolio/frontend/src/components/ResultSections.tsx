import type { EChartsOption } from "echarts";
import { ReactNode, useMemo, useState } from "react";
import { AssetResult, RunResult, RunView, StressItem } from "../api";
import { ReliabilityBadge } from "./Badges";
import { axisStyle, baseOption, ChartCard, Palette } from "./Chart";
import { dateAz, int, money, pct, price, prob } from "../format";
import { t } from "../i18n";
import { L, LANG } from "../lang";

/** Decimal comma in Azerbaijani, point in English. */
const dec = (s: string) => (LANG === "az" ? s.replace(".", ",") : s);

export type Unit = "money" | "pct";

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Compact axis label for fractions: 0.1 -> "10%", 0.025 -> "2,5%". */
export function pctAxis(v: number): string {
  const x = Math.round(v * 1000) / 10;
  return `${x < 0 ? "−" : ""}${Number.isInteger(x) ? Math.abs(x) : dec(Math.abs(x).toFixed(1))}%`;
}

export function signClass(v: number) {
  return v > 0 ? "pos" : v < 0 ? "neg" : "";
}

/** P(X >= x) from the 1..99 percentile grid (resolution ~1 percentage point). */
export function probAbove(q: number[], x: number): { p: number; bound: "lt" | "gt" | null } {
  if (x <= q[0]) return { p: 0.99, bound: "gt" };
  if (x >= q[q.length - 1]) return { p: 0.01, bound: "lt" };
  for (let i = 1; i < q.length; i++) {
    if (x <= q[i]) {
      const f = (x - q[i - 1]) / Math.max(q[i] - q[i - 1], 1e-12);
      const cdf = (i + f) / 100;
      return { p: 1 - cdf, bound: null };
    }
  }
  return { p: 0.01, bound: "lt" };
}

const LEVEL_WORD: Record<string, string> = { high: L("Yüksək", "High"), medium: L("Orta", "Medium"), low: L("Aşağı", "Low"), checking: L("Yoxlanılır", "Checking") };

/** Expected vs observed as two bars on one scale. */
export function VsBars({ expected, observed, fmt }: { expected: number; observed: number; fmt: (v: number) => string }) {
  const max = Math.max(expected, observed, 1e-9);
  return (
    <div className="vs" aria-hidden="true">
      <div className="vs-row"><span>{L("gözlənilən", "expected")}</span><div className="vs-bar"><div className="exp" style={{ width: `${(expected / max) * 100}%` }} /></div><span className="num">{fmt(expected)}</span></div>
      <div className="vs-row"><span>{L("faktiki", "actual")}</span><div className="vs-bar"><div className="obs" style={{ width: `${(observed / max) * 100}%` }} /></div><span className="num">{fmt(observed)}</span></div>
    </div>
  );
}

/** What each kind of number on this page can be trusted for (PROMPT.md 12 labels, with the reason). */
const NUMBER_TRUST: { item: string; level: string; why: string }[] = [
  { item: L("Aralıqların eni (50%, 90%) və portfel üzrə nəticələr", "Width of the ranges (50%, 90%) and portfolio-level results"), level: "high",
    why: L("Volatillik və korrelyasiya modelləri ən yaxşı bunu ölçür; keçmiş məlumatda yoxlanılır.", "Volatility and correlation models measure this best; it is checked on past data.") },
  { item: L("Portfelin VaR və CVaR 95%-i", "The portfolio's VaR and CVaR 95%"), level: "high",
    why: L("Hər gün üçün keçmişdə proqnoz verilib və faktiki itkilərlə tutuşdurulub (yuxarıdakı rəqəmlər).", "A forecast was made for each past day and compared with the actual losses (the figures above).") },
  { item: L("Ayrı səhmlər üzrə aralıqlar və ehtimallar", "Ranges and probabilities for individual stocks"), level: "medium",
    why: L("Bir şirkətin xəbərləri (hesabat, birləşmə) modeldə yoxdur; tək səhmdə səs-küy çoxdur.", "Company news (reports, mergers) is not in the model; a single stock is noisy.") },
  { item: L("Ekstremal hallar (99%, drawdown quyruğu)", "Extreme cases (99%, drawdown tail)"), level: "medium-low",
    why: L("Nadir hadisələr keçmişdə az müşahidə olunub, quyruğun forması qeyri-müəyyəndir.", "Rare events were seldom observed in the past; the shape of the tail is uncertain.") },
  { item: L("Median və qalxma/düşmə istiqaməti", "Median and the up/down direction"), level: "low",
    why: L("Qiymətin istiqamətini heç bir model etibarlı proqnozlaşdıra bilmir. Median ortadakı ssenaridir, proqnoz qiymət deyil.", "No model can reliably forecast the direction of a price. The median is the middle scenario, not a price forecast.") },
];

export function TrustPanel({ run }: { run: RunView }) {
  const tr = run.trust;
  const lvl = run.reliability;
  const times = (v: number) => `${Number.isInteger(v) ? v : dec(v.toFixed(1))}`;
  return (
    <section className="card" id="trust">
      <div className="card-head">
        <div>
          <h2>{L("Bu rəqəmlərə nə qədər güvənə bilərəm?", "How far can I trust these numbers?")}</h2>
          <div className="sub">
            {L("Model keçmiş məlumatda sınanıb: əvvəlki tarixlərdə verdiyi aralıqlar sonradan baş verən faktiki nəticələrlə müqayisə olunub.", "The model was tested on past data: the ranges it gave on earlier dates were compared with what actually happened next.")}
          </div>
        </div>
      </div>
      <div className="trust-top">
        <div>
          <div className="eyebrow">{L("Ümumi etibarlılıq", "Overall reliability")}</div>
          <div className="level-word">{LEVEL_WORD[lvl] ?? lvl}</div>
          <div className={`meter ${lvl}`} aria-hidden="true"><span /><span /><span /><span /></div>
          <p className="small muted">{run.reliability_text}</p>
          {tr && (
            <p className="small">
              {L(`${tr.checks_passed} / ${tr.checks_total} statistik yoxlamadan keçib.`, `Passed ${tr.checks_passed} of ${tr.checks_total} statistical checks.`)}
              {tr.fallback_model && L(" Əsas model yoxlamalardan keçmədiyi üçün daha ehtiyatlı alternativ model istifadə olunub.", " The main model failed the checks, so a more cautious alternative model was used.")}
            </p>
          )}
        </div>
        {tr ? (
          <div className="facts">
            {tr.var95 && (
              <div className="fact">
                <div className="fact-q">{L("Pis gün sərhədi (gündəlik VaR 95%)", "Bad-day threshold (daily VaR 95%)")}</div>
                <div className="fact-a">{L(`${tr.var95.observed} dəfə aşılıb · gözlənilən ~${times(tr.var95.expected)}`, `exceeded ${tr.var95.observed} times · expected ~${times(tr.var95.expected)}`)}</div>
                <VsBars expected={tr.var95.expected} observed={tr.var95.observed} fmt={times} />
                <div className="fact-n">{L(`Son ${tr.backtest_days} ticarət günündə (${tr.backtest_months} ay) itki bu sərhədi təxminən 20 gündən 1-də keçməli idi.`, `Over the last ${tr.backtest_days} trading days (${tr.backtest_months} months) the loss should have crossed this threshold on about 1 day in 20.`)}</div>
              </div>
            )}
            {tr.var99 && (
              <div className="fact">
                <div className="fact-q">{L("Çox pis gün (gündəlik VaR 99%)", "Very bad day (daily VaR 99%)")}</div>
                <div className="fact-a">{L(`${tr.var99.observed} dəfə aşılıb · gözlənilən ~${times(tr.var99.expected)}`, `exceeded ${tr.var99.observed} times · expected ~${times(tr.var99.expected)}`)}</div>
                <VsBars expected={tr.var99.expected} observed={tr.var99.observed} fmt={times} />
                <div className="fact-n">{L("100 gündən 1-də gözlənilir. Hadisə az olduğu üçün bu müqayisə daha qeyri-dəqiqdir.", "Expected on 1 day in 100. With so few events this comparison is less precise.")}</div>
              </div>
            )}
            {tr.cover90 && (
              <div className="fact">
                <div className="fact-q">{L("3 aylıq 90% aralıq tuturdumu?", "Did the 3-month 90% range hold?")}</div>
                <div className="fact-a">{L(`${pct(tr.cover90.observed)} hallarda içində · hədəf ${pct(tr.cover90.nominal)}`, `inside in ${pct(tr.cover90.observed)} of cases · target ${pct(tr.cover90.nominal)}`)}</div>
                <VsBars expected={tr.cover90.nominal} observed={tr.cover90.observed} fmt={(v) => pct(v)} />
                <div className="fact-n">
                  {L(`${tr.windows_3m} üç aylıq dövr yoxlanılıb, amma onlar üst-üstə düşür: bir-birindən tam asılı olmayan cəmi ${tr.cover90.independent_windows} dövr var. Ona görə 3 aylıq yoxlama gündəlikdən zəifdir.`,
                    `${tr.windows_3m} three-month periods were checked, but they overlap: only ${tr.cover90.independent_windows} are fully independent. So the 3-month check is weaker than the daily one.`)}
                </div>
              </div>
            )}
            {tr.cover50 && (
              <div className="fact">
                <div className="fact-q">{L("3 aylıq 50% aralıq tuturdumu?", "Did the 3-month 50% range hold?")}</div>
                <div className="fact-a">{L(`${pct(tr.cover50.observed)} hallarda içində · hədəf ${pct(tr.cover50.nominal)}`, `inside in ${pct(tr.cover50.observed)} of cases · target ${pct(tr.cover50.nominal)}`)}</div>
                <VsBars expected={tr.cover50.nominal} observed={tr.cover50.observed} fmt={(v) => pct(v)} />
                <div className="fact-n">{L("Faktiki nəticənin təxminən hər iki haldan birində bu aralıqdan kənara çıxması normaldır.", "It is normal for the actual result to fall outside this range about one time in two.")}</div>
              </div>
            )}
            {tr.mc_rel_error != null && (
              <div className="fact">
                <div className="fact-q">{L("Simulyasiyanın dəqiqliyi", "Simulation precision")}</div>
                <div className="fact-a">±{pct(tr.mc_rel_error)} {L("nisbi xəta", "relative error")}</div>
                <div className="fact-n">
                  {L(`${int(tr.scenarios)} ssenari hesablanıb. VaR və CVaR təkrar hesablansa, təsadüfi fərq təxminən bu qədər olar — modelin özünün xətası bundan böyükdür.`,
                    `${int(tr.scenarios)} scenarios were computed. Recomputing VaR and CVaR would change them randomly by about this much — the model's own error is larger.`)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="banner info">
            {run.validation_status === "failed"
              ? L("Keçmiş məlumatda yoxlama aparıla bilmədi (məlumat azdır). Nəticələri ehtiyatla şərh edin.", "The check on past data could not be run (too little data). Interpret the results with care.")
              : L("Keçmiş məlumatda yoxlama davam edir. Bitəndə bu bölmə avtomatik yenilənəcək.", "The check on past data is running. This section updates automatically when it finishes.")}
          </div>
        )}
      </div>

      <h3>{L("Hansı rəqəmə nə qədər güvənmək olar", "How far each number can be trusted")}</h3>
      <div className="table-wrap">
        <table className="trust-list">
          <tbody>
            {NUMBER_TRUST.map((r) => (
              <tr key={r.item}>
                <td>{r.item}</td>
                <td><ReliabilityBadge level={r.level} /></td>
                <td className="small muted">{r.why}</td>
              </tr>
            ))}
            <tr>
              <td>{L("Stress testləri", "Stress tests")}</td>
              <td><span className="badge checking">{L("ssenari", "scenario")}</span></td>
              <td className="small muted">{L("Ehtimal deyil: “bu hadisə təkrarlansa nə olardı” sualına cavabdır.", "Not a probability: it answers “what if this event happened again”.")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 18 }}>{L("Modelin bilmədiyi şeylər", "What the model does not know")}</h3>
      <ul className="notknow">
        <li>{L("Şirkət xəbərləri, maliyyə hesabatları, birləşmələr — model yalnız qiymət tarixçəsinə baxır.", "Company news, financial reports, mergers — the model looks only at price history.")}</li>
        <li>{L(`Son ${tr?.history_years ?? 5} ilin məlumatında olmayan tip böhranlar və bazar rejimləri.`, `Kinds of crises and market regimes absent from the last ${tr?.history_years ?? 5} years of data.`)}</li>
        <li>{L("Faiz, inflyasiya, siyasi qərarlar kimi makro dəyişikliklər birbaşa daxil deyil.", "Macro changes such as interest rates, inflation and political decisions are not included directly.")}</li>
        <li>{L("Likvidlik: böyük mövqeni tez satmaq qiyməti özü dəyişə bilər.", "Liquidity: selling a large position quickly can itself move the price.")}</li>
        <li>{L("Gələcək dividend və korporativ hadisələr (bölünmə, geri alış).", "Future dividends and corporate events (splits, buybacks).")}</li>
        <li>{L("Faktiki nəticə 10 haldan 1-də 90% aralığın kənarına çıxır — bu səhv deyil, aralığın tərifidir.", "The actual result falls outside the 90% range 1 time in 10 — that is not an error, it is what the range means.")}</li>
      </ul>
      <p className="small muted" style={{ marginTop: 10 }}>
        {L("Model necə qurulur", "How the model is built")}: <a href="#glossary" onClick={(e) => {
          e.preventDefault();
          document.getElementById("glossary")?.scrollIntoView({ behavior: "smooth" });
        }}>{L("fərziyyələr və lüğət", "assumptions and glossary")}</a>. {t("results")} {L("investisiya tövsiyəsi deyil.", "are not investment advice.")}
      </p>
    </section>
  );
}

export function FanChart({ res, unit, asset, showPaths, setShowPaths }: {
  res: RunResult; unit: Unit; asset: string; showPaths: boolean; setShowPaths: (b: boolean) => void;
}) {
  const a = res.assets.find((x) => x.symbol === asset);
  const ccy = res.base_currency;
  const fan = a ? a.fan : res.fan;
  const base = a ? a.price0 : res.V0;
  const pos = a ? res.current.positions.find((p) => p.symbol === a.symbol) : undefined;
  const cost = a ? (pos ? pos.cost_base / pos.quantity : null) : res.cost_total;
  const hist = a ? { dates: [] as string[], values: [] as number[] } : res.history;
  const dates = [...hist.dates, ...res.dates];
  const conv = (v: number) => (unit === "pct" ? (v / base - 1) * 100 : v);
  const fmt = (v: number) => (unit === "pct" ? pct(v / 100, { sign: true }) : a ? price(v, ccy) : money(v, ccy));
  const pad = (arr: (number | null)[]) => [...hist.values.map(() => null), ...arr];
  const histSeries = [...hist.values.map(conv), ...res.dates.map(() => null)];
  const allVals = [...hist.values.map(conv), ...fan.map((r) => conv(r[0])), ...fan.map((r) => conv(r[4])),
    ...(cost != null ? [conv(cost)] : [])];
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const padY = (hi - lo) * 0.05 || Math.abs(hi) * 0.05 || 1;
  if (hist.values.length) histSeries[hist.values.length - 1] = conv(hist.values[hist.values.length - 1]);

  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 80, right: 24, top: 24, bottom: 40 },
    xAxis: { type: "category", data: dates, ...axisStyle(p), splitLine: { show: false },
      axisLabel: { color: p.muted, fontSize: 12, formatter: (v: string) => dateAz(v).slice(0, 5) } },
    yAxis: { type: "value", min: lo - padY, max: hi + padY, ...axisStyle(p),
      axisLabel: { color: p.muted, fontSize: 12, formatter: (v: number) => fmt(v), showMinLabel: false, showMaxLabel: false } },
    tooltip: {
      ...baseOption(p).tooltip,
      trigger: "axis",
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number }[];
        const i = ps[0]?.dataIndex ?? 0;
        const d = dates[i];
        const fi = i - hist.values.length;
        if (fi < 0) return `${dateAz(d)}<br/>${L("Keçmiş dəyər (cari say ilə)", "Past value (at today's quantities)")}: <b>${fmt(conv(hist.values[i]))}</b>`;
        const r = fan[fi];
        return `${dateAz(d)}<br/>${L("95-ci persentil", "95th percentile")}: ${fmt(conv(r[4]))}<br/>${L("75-ci", "75th")}: ${fmt(conv(r[3]))}<br/>` +
          `<b>Median: ${fmt(conv(r[2]))}</b><br/>${L("25-ci", "25th")}: ${fmt(conv(r[1]))}<br/>${L("5-ci", "5th")}: ${fmt(conv(r[0]))}`;
      },
    },
    series: [
      { name: "90% lower", type: "line", data: pad(fan.map((r) => conv(r[0]))), stack: "b90", symbol: "none",
        lineStyle: { opacity: 0 }, silent: true },
      { name: L("90% aralıq", "90% range"), type: "line", data: pad(fan.map((r) => conv(r[4]) - conv(r[0]))), stack: "b90", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: p.bandLight }, silent: true },
      { name: "50% lower", type: "line", data: pad(fan.map((r) => conv(r[1]))), stack: "b50", symbol: "none",
        lineStyle: { opacity: 0 }, silent: true },
      { name: L("50% aralıq", "50% range"), type: "line", data: pad(fan.map((r) => conv(r[3]) - conv(r[1]))), stack: "b50", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: p.bandDark }, silent: true },
      ...(!a && showPaths
        ? res.sample_paths.map((sp, k) => ({
            name: `${L("ssenari", "scenario")} ${k + 1}`, type: "line" as const, data: pad(sp.map(conv)), symbol: "none",
            lineStyle: { color: p.neutral, width: 0.7, opacity: 0.6 }, silent: true,
          }))
        : []),
      { name: "Median", type: "line", data: pad(fan.map((r) => conv(r[2]))), symbol: "none",
        lineStyle: { color: p.q, width: 1.5, type: "dashed" } },
      { name: L("Keçmiş dəyər", "Past value"), type: "line", data: histSeries, symbol: "none", lineStyle: { color: p.fg, width: 1.3 },
        markLine: {
          silent: true, symbol: "none", label: { color: p.muted, fontSize: 12 },
          data: [
            ...(hist.values.length ? [{ xAxis: hist.values.length - 1, lineStyle: { color: p.muted, type: "solid" as const }, label: { formatter: L("bu gün", "today") } }] : []),
            ...(cost != null ? [{ yAxis: conv(cost), lineStyle: { color: p.warn, type: "dotted" as const, width: 1.2 }, label: { formatter: L("maya dəyəri", "cost"), position: "insideEndTop" as const } }] : []),
          ],
        } },
    ],
  });

  const table = (
    <table>
      <thead>
        <tr><th>{L("Tarix", "Date")}</th><th className="num">5%</th><th className="num">25%</th><th className="num">Median</th><th className="num">75%</th><th className="num">95%</th></tr>
      </thead>
      <tbody>
        {res.dates.map((d, i) => (
          <tr key={d}>
            <td>{dateAz(d)}</td>
            {fan[i].map((v, k) => <td className="num" key={k}>{fmt(conv(v))}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartCard
      id="fan"
      title={a ? `${a.investing_symbol}: ${L("gündəlik paylanma", "daily distribution")} (${res.base_currency})` : L("Portfelin dəyəri: harada olacağam?", "Portfolio value: where will I be?")}
      subtitle={L("Açıq zolaq — 90% aralıq, tünd zolaq — 50% aralıq, qırıq xətt — median (proqnoz qiymət deyil). Nöqtəli xətt — maya dəyəri.", "Light band — 90% range, dark band — 50% range, dashed line — median (not a price forecast). Dotted line — cost.")}
      build={build}
      table={table}
      height="tall"
      ariaLabel={L("Portfel dəyərinin ehtimal paylanması qrafiki", "Chart of the probability distribution of the portfolio value")}
      deps={[res, unit, asset, showPaths]}
      extra={!a && (
        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} /> {L("nümunə ssenarilər", "sample scenarios")}
        </label>
      )}
    />
  );
}

export function PnlSection({ res, cp, unit }: { res: RunResult; cp: number; unit: Unit }) {
  const ccy = res.base_currency;
  const c = res.checkpoints[cp];
  const f = (v: number, base: number) => (unit === "money" ? money(v, ccy, { sign: true }) : pct(base ? v / base : 0, { sign: true }));
  return (
    <section className="card" id="pnl">
      <h2>{L("Mənfəət/zərər", "Profit/loss")}</h2>
      <p className="muted small">
        {L(`${dateAz(res.checkpoint_dates[cp])} tarixində portfel üzrə mənfəət/zərər: median ${f(c.pnl_median, res.cost_total)}, 50% aralıq ${f(c.pnl_p25, res.cost_total)} … ${f(c.pnl_p75, res.cost_total)}, 90% aralıq ${f(c.pnl_p05, res.cost_total)} … ${f(c.pnl_p95, res.cost_total)}. Mövqelər üzrə aralıqlar dövrün sonuna aiddir. Dövrün sonunda maya dəyərinə nisbətən 10%-dən çox zərər ehtimalı ${prob(res.pnl_end.prob_loss_over["0.1"])}; `,
          `Portfolio profit/loss on ${dateAz(res.checkpoint_dates[cp])}: median ${f(c.pnl_median, res.cost_total)}, 50% range ${f(c.pnl_p25, res.cost_total)} … ${f(c.pnl_p75, res.cost_total)}, 90% range ${f(c.pnl_p05, res.cost_total)} … ${f(c.pnl_p95, res.cost_total)}. The position ranges refer to the period end. Probability of a loss of more than 10% against cost at the period end: ${prob(res.pnl_end.prob_loss_over["0.1"])}; `)}
        {res.pnl_end.loss_cvar95_vs_cost > 0
          ? L(`ən pis 5% ssenaridə orta zərər ${money(res.pnl_end.loss_cvar95_vs_cost, ccy)}.`, `the average loss in the worst 5% of scenarios is ${money(res.pnl_end.loss_cvar95_vs_cost, ccy)}.`)
          : L(`ən pis 5% ssenaridə belə orta nəticə maya dəyərindən ${money(-res.pnl_end.loss_cvar95_vs_cost, ccy)} yuxarıdır.`, `even in the worst 5% of scenarios the average result is ${money(-res.pnl_end.loss_cvar95_vs_cost, ccy)} above cost.`)}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{L("Səhm", "Stock")}</th><th className="num">{L("Say", "Qty")}</th><th className="num">{L("Maya dəyəri", "Cost")}</th><th className="num">{L("Bazar dəyəri", "Market value")}</th>
              <th className="num">{L("Cari m/z", "Current P/L")}</th><th className="num">{L("Reallaşmış", "Realised")}</th><th className="num">{L("Dividend", "Dividends")}</th><th className="num">{L("Təxmini m/z (50%)", "Est. P/L (50%)")}</th>
              <th className="num">{L("Təxmini m/z (90%)", "Est. P/L (90%)")}</th><th className="num">{L("Mənfəətdə olma", "In profit")}</th><th className="num">{L("Maya dəyərinə qayıtma", "Back to cost")}</th>
            </tr>
          </thead>
          <tbody>
            {res.current.positions.map((p) => {
              const a = res.assets.find((x) => x.symbol === p.symbol)!;
              return (
                <tr key={p.symbol}>
                  <td title={p.name}>{p.investing_symbol}</td>
                  <td className="num">{p.quantity}</td>
                  <td className="num">{money(p.cost_base, ccy)}</td>
                  <td className="num">{money(p.market_value_base, ccy)}</td>
                  <td className={`num ${signClass(p.unrealized)}`}>{f(p.unrealized, p.cost_base)}</td>
                  <td className={`num ${signClass(p.realized)}`}>{p.realized ? money(p.realized, ccy, { sign: true }) : "—"}</td>
                  <td className="num">{p.dividends ? money(p.dividends, ccy) : "—"}</td>
                  <td className="num">{f(a.pnl_end.p25, p.cost_base)} … {f(a.pnl_end.p75, p.cost_base)}</td>
                  <td className="num">{f(a.pnl_end.p05, p.cost_base)} … {f(a.pnl_end.p95, p.cost_base)}</td>
                  <td className="num">{prob(a.prob_profit)}</td>
                  <td className="num">{a.prob_break_even != null ? prob(a.prob_break_even) : <span className="muted">{L("mənfəətdədir", "in profit")}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {L("“Maya dəyərinə qayıtma” — hazırda zərərdə olan mövqenin dövr ərzində ən azı bir dəfə maya dəyərinə çatma ehtimalı. Maya dəyəri keçmişdə ödənilib; gələcək qərarlar onun əsasında verilməməlidir.",
          "“Back to cost” — the probability that a position now at a loss reaches its cost at least once during the period. The cost was paid in the past; future decisions should not rest on it.")}
      </p>
    </section>
  );
}

/** level: confidence as a fraction string ("0.95", "0.975"); risk: VaR/CVaR at that level (positive = loss),
 *  from the run's quantile grid for user-chosen levels, otherwise the run's own 95/99 measures. */
export function Distribution({ res, level, risk }: { res: RunResult; level: string; risk?: { var: number; cvar: number } }) {
  const { edges, counts } = res.histogram;
  const centers = counts.map((_, i) => (edges[i] + edges[i + 1]) / 2);
  const varPct = -(risk ? risk.var : res.risk[level].var_pct);
  const cvarPct = -(risk ? risk.cvar : res.risk[level].cvar_pct);
  const idxOf = (x: number) => Math.max(0, Math.min(centers.length - 1, centers.findIndex((c, i) => x < edges[i + 1])));
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 56, right: 24, top: 46, bottom: 40 },
    xAxis: { type: "category", data: centers.map((c) => pct(c)), ...axisStyle(p), splitLine: { show: false },
      name: L("3 aylıq gəlir", "3-month return"), nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", ...axisStyle(p), axisLabel: { show: false }, name: "" },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis",
      formatter: (ps: unknown) => {
        const i = (ps as { dataIndex: number }[])[0].dataIndex;
        return `${pct(edges[i])} … ${pct(edges[i + 1])}<br/>${prob(counts[i] / res.scenarios)} ${L("ssenari", "of scenarios")}`;
      } },
    series: [{
      type: "bar", barCategoryGap: "8%",
      data: counts.map((c, i) => ({ value: c, itemStyle: { color: centers[i] <= varPct ? p.neg : p.neutral } })),
      markLine: {
        symbol: "none", silent: true, label: { color: p.fg, fontSize: 12 },
        data: [
          { xAxis: idxOf(varPct), lineStyle: { color: p.neg, type: "solid" },
            label: { formatter: `VaR ${pct(Number(level))}: ${pct(varPct)}`, position: "end", distance: 4 } },
          { xAxis: idxOf(cvarPct), lineStyle: { color: p.neg, type: "dashed" },
            label: { formatter: `CVaR: ${pct(cvarPct)}`, position: "end", distance: 20 } },
        ],
      },
    }],
  });
  return (
    <ChartCard
      id="dist"
      title={L("Ən pis halda nə qədər itirə bilərəm?", "How much could I lose in a bad case?")}
      subtitle={L(`Dövrün sonunda gəlirin paylanması (${int(res.scenarios)} ssenari). Rəngli quyruq — VaR-dan pis ssenarilər.`, `Distribution of the return at the period end (${int(res.scenarios)} scenarios). Coloured tail — scenarios worse than VaR.`) +
        (res.histogram.below || res.histogram.above
          ? L(` Ən ekstremal ${int((res.histogram.below ?? 0) + (res.histogram.above ?? 0))} ssenari (hər tərəfdə 0,1%) qrafikdən kənardadır, ölçülərə daxildir.`, ` The ${int((res.histogram.below ?? 0) + (res.histogram.above ?? 0))} most extreme scenarios (0.1% on each side) are off the chart but included in the measures.`)
          : "")}
      build={build}
      deps={[res, level, risk?.var, risk?.cvar]}
      ariaLabel={L("Dövrün sonunda gəlirin histogramı", "Histogram of the return at the period end")}
      table={
        <table>
          <thead><tr><th>{L("Gəlir aralığı", "Return range")}</th><th className="num">{L("Ssenarilərin payı", "Share of scenarios")}</th></tr></thead>
          <tbody>
            {counts.map((c, i) => (
              <tr key={i}><td>{pct(edges[i])} … {pct(edges[i + 1])}</td><td className="num">{prob(c / res.scenarios)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function Drawdown({ res }: { res: RunResult }) {
  const all = res.drawdown.exceedance.filter((e) => e.x > 0);
  const cut = all.findIndex((e) => e.x >= 0.15 && e.p_touch < 0.005);
  const ex = cut > 0 ? all.slice(0, cut + 1) : all;
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    legend: { top: 0, textStyle: { color: p.muted } },
    grid: { left: 56, right: 24, top: 32, bottom: 40 },
    xAxis: { type: "category", data: ex.map((e) => `−${pct(e.x)}`), ...axisStyle(p), splitLine: { show: false },
      name: L("itki səviyyəsi", "loss level"), nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", max: 1, ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v: number) => `${Math.round(v * 100)}%` } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", valueFormatter: (v) => prob(Number(v)) },
    series: [
      { name: L("Dövr ərzində bu səviyyəyə toxunma", "Touching this level during the period"), type: "line", data: ex.map((e) => e.p_touch), symbol: "none",
        lineStyle: { color: p.q, width: 1.6 }, itemStyle: { color: p.q } },
      { name: L("Dövrün sonunda bu itkidə olma", "At this loss at the period end"), type: "line", data: ex.map((e) => e.p_end), symbol: "none",
        lineStyle: { color: p.neutral, width: 1.4, type: "dashed" }, itemStyle: { color: p.neutral } },
    ],
  });
  const m = res.drawdown.mdd_percentiles;
  return (
    <ChartCard
      id="drawdown"
      title={L("Drawdown: dövr ərzində düşmə ehtimalı", "Drawdown: probability of a fall during the period")}
      subtitle={L(`Maksimal drawdown medianı ${pct(m["50"])}; 20 rübdən 1-də ${pct(m["5"])}-dən pis. Toxunma ehtimalı adətən dövrün sonunda həmin səviyyədə olma ehtimalından ~2 dəfə yüksəkdir.`, `Median maximum drawdown ${pct(m["50"])}; worse than ${pct(m["5"])} in 1 quarter in 20. The probability of touching a level is usually ~2× that of ending there.`)}
      build={build}
      deps={[res]}
      ariaLabel={L("Drawdown aşma əyrisi", "Drawdown exceedance curve")}
      height="short"
      table={
        <table>
          <thead><tr><th>{L("İtki", "Loss")}</th><th className="num">{L("Toxunma", "Touch")}</th><th className="num">{L("Dövrün sonunda", "At period end")}</th><th className="num">Drawdown ≥</th></tr></thead>
          <tbody>
            {ex.map((e) => (
              <tr key={e.x}><td>−{pct(e.x)}</td><td className="num">{prob(e.p_touch)}</td><td className="num">{prob(e.p_end)}</td><td className="num">{prob(e.p_drawdown)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function StocksSection({ res }: { res: RunResult }) {
  const [sortKey, setSortKey] = useState<"weight" | "median" | "width" | "prob_up" | "cvar_share">("weight");
  const [calcSym, setCalcSym] = useState(res.assets[0]?.symbol ?? "");
  const [target, setTarget] = useState("");
  const rows = useMemo(() => {
    const r = res.assets.map((a) => ({
      a,
      median: a.end.median / a.price0 - 1,
      lo50: a.end.p25 / a.price0 - 1, hi50: a.end.p75 / a.price0 - 1,
      lo90: a.end.p05 / a.price0 - 1, hi90: a.end.p95 / a.price0 - 1,
      width: (a.end.p95 - a.end.p05) / a.price0,
    }));
    const key = (x: (typeof r)[number]) =>
      sortKey === "weight" ? x.a.weight : sortKey === "median" ? x.median : sortKey === "width" ? x.width : sortKey === "prob_up" ? x.a.prob_up : x.a.cvar_share;
    return r.sort((x, y) => key(y) - key(x));
  }, [res, sortKey]);
  const ordered = [...rows].reverse();
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 64, right: 20, top: 16, bottom: 36 },
    yAxis: { type: "category", data: ordered.map((r) => r.a.investing_symbol), ...axisStyle(p), splitLine: { show: false } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, hideOverlap: true, formatter: pctAxis } },
    tooltip: { ...baseOption(p).tooltip, trigger: "item",
      formatter: (x: unknown) => {
        const r = ordered[(x as { dataIndex: number }).dataIndex];
        return `<b>${r.a.investing_symbol}</b> ${r.a.name}<br/>${L("Median", "Median")}: ${pct(r.median, { sign: true })}<br/>50%: ${pct(r.lo50, { sign: true })} … ${pct(r.hi50, { sign: true })}<br/>90%: ${pct(r.lo90, { sign: true })} … ${pct(r.hi90, { sign: true })}`;
      } },
    series: [{
      type: "custom",
      encode: { x: [1, 2, 3, 4, 5], y: 0 },
      data: ordered.map((r, i) => [i, r.lo90, r.lo50, r.median, r.hi50, r.hi90]),
      renderItem: (_params, api) => {
        const y = api.coord([0, api.value(0)])[1];
        const x = (k: number) => api.coord([api.value(k), 0])[0];
        return {
          type: "group",
          children: [
            { type: "line", shape: { x1: x(1), y1: y, x2: x(5), y2: y }, style: { stroke: p.q, lineWidth: 1.2 } },
            { type: "line", shape: { x1: x(2), y1: y, x2: x(4), y2: y }, style: { stroke: p.q, lineWidth: 6, opacity: 0.55 } },
            { type: "circle", shape: { cx: x(3), cy: y, r: 4.5 }, style: { fill: p.surface, stroke: p.q, lineWidth: 2 } },
          ],
        };
      },
    }],
  });
  const ca = res.assets.find((x) => x.symbol === calcSym) as AssetResult | undefined;
  const tv = Number(target.replace(",", "."));
  const pr = ca && tv > 0 ? probAbove(ca.end_q, tv * ca.fx_to_base) : null;
  const th = (k: typeof sortKey, label: string) => (
    <th className="num"><button className="sort" onClick={() => setSortKey(k)} aria-pressed={sortKey === k}>{label}{sortKey === k ? " ▼" : ""}</button></th>
  );
  return (
    <>
      <ChartCard
        id="stocks"
        title={L("Səhmlər: dövrün sonunda qiymət dəyişikliyi", "Stocks: price change by the period end")}
        subtitle={L("Nöqtə — median, qalın xətt — 50% aralıq, nazik xətt — 90% aralıq (əsas valyutada).", "Dot — median, thick line — 50% range, thin line — 90% range (in the base currency).")}
        build={build}
        deps={[res, sortKey]}
        ariaLabel={L("Səhmlər üzrə interval qrafiki", "Interval chart by stock")}
        height={res.assets.length > 8 ? "tall" : "short"}
        table={
          <table>
            <thead><tr><th>{L("Səhm", "Stock")}</th><th className="num">5%</th><th className="num">25%</th><th className="num">Median</th><th className="num">75%</th><th className="num">95%</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.a.symbol}>
                  <td>{r.a.investing_symbol}</td>
                  {[r.lo90, r.lo50, r.median, r.hi50, r.hi90].map((v, k) => <td key={k} className="num">{pct(v, { sign: true })}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      <section className="card">
        <h2>{L("Səhmlər cədvəli", "Stocks table")}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L("Səhm", "Stock")}</th>{th("weight", L("Çəki", "Weight"))}{th("median", "Median")}<th className="num">{L("50% aralıq", "50% range")}</th><th className="num">{L("90% aralıq", "90% range")}</th>
                {th("width", L("Aralığın eni", "Range width"))}{th("prob_up", L("Qalxma ehtimalı", "Probability up"))}{th("cvar_share", L("CVaR payı", "CVaR share"))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.a.symbol}>
                  <td title={r.a.name}>{r.a.investing_symbol} <span className="muted small">{r.a.exchange}</span></td>
                  <td className="num">{pct(r.a.weight)}</td>
                  <td className={`num ${signClass(r.median)}`}>{pct(r.median, { sign: true })}</td>
                  <td className="num">{pct(r.lo50, { sign: true })} … {pct(r.hi50, { sign: true })}</td>
                  <td className="num">{pct(r.lo90, { sign: true })} … {pct(r.hi90, { sign: true })}</td>
                  <td className="num">{pct(r.width)}</td>
                  <td className="num">{prob(r.a.prob_up)}</td>
                  <td className="num">{pct(r.a.cvar_share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 16 }}>{L("Hədəf qiymət kalkulyatoru", "Target price calculator")}</h3>
        <div className="form-row">
          <label>
            {L("Səhm", "Stock")}
            <select value={calcSym} onChange={(e) => setCalcSym(e.target.value)}>
              {res.assets.map((a) => <option key={a.symbol} value={a.symbol}>{a.investing_symbol}</option>)}
            </select>
          </label>
          <label>
            {L("Hədəf qiymət", "Target price")} ({ca?.currency})
            <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <div style={{ flex: 2 }}>
            {pr && ca && (
              <p>
                {L(`${dateAz(res.horizon_end)} tarixində qiymətin ${price(tv, ca.currency)} və ya daha yuxarı olma ehtimalı:`, `Probability that the price is ${price(tv, ca.currency)} or higher on ${dateAz(res.horizon_end)}:`)}{" "}
                <b>{pr.bound === "lt" ? "<1%" : pr.bound === "gt" ? ">99%" : prob(pr.p)}</b>
                <span className="muted small"> ({L("cari", "now")} ~{price(ca.price0 / ca.fx_to_base, ca.currency)}; {L("dövr ərzində toxunma ehtimalı adətən təxminən iki dəfə yüksəkdir", "the probability of touching it during the period is usually about twice as high")})</span>
              </p>
            )}
          </div>
        </div>
        {res.targets.length > 0 && (
          <p className="small">
            {L("Saxlanılmış hədəflər", "Saved targets")}: {res.targets.map((tg) => `${tg.symbol}: ${tg.target_price ? L(`hədəf — sonda ${prob(tg.prob_target)}, toxunma ${prob(tg.prob_touch_target)}`, `target — at the end ${prob(tg.prob_target)}, touch ${prob(tg.prob_touch_target)}`) : ""}${tg.stop_loss ? L(` stop-loss toxunma ${prob(tg.prob_touch_stop)}`, ` stop-loss touch ${prob(tg.prob_touch_stop)}`) : ""}`).join(" · ")}
          </p>
        )}
      </section>
    </>
  );
}

export function RiskContribution({ res }: { res: RunResult }) {
  const rows = [...res.assets].sort((a, b) => a.cvar_share - b.cvar_share);
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    legend: { top: 0, textStyle: { color: p.muted } },
    grid: { left: 64, right: 20, top: 30, bottom: 36 },
    yAxis: { type: "category", data: rows.map((r) => r.investing_symbol), ...axisStyle(p), splitLine: { show: false } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, hideOverlap: true, formatter: pctAxis } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => pct(Number(v)) },
    series: [
      { name: L("Çəki", "Weight"), type: "scatter", data: rows.map((r) => r.weight), symbolSize: 9, itemStyle: { color: p.neutral } },
      { name: L("CVaR töhfəsi", "CVaR contribution"), type: "scatter", data: rows.map((r) => r.cvar_share), symbolSize: 10,
        itemStyle: { color: (x: { dataIndex: number }) => (rows[x.dataIndex].cvar_share / Math.max(rows[x.dataIndex].weight, 1e-9) > 1.5 ? p.neg : p.q) } as never },
      { type: "custom", silent: true, data: rows.map((r, i) => [i, r.weight, r.cvar_share]), encode: { y: 0, x: [1, 2] },
        renderItem: (_params, api) => {
          const y = api.coord([0, api.value(0)])[1];
          return { type: "line", shape: { x1: api.coord([api.value(1), 0])[0], y1: y, x2: api.coord([api.value(2), 0])[0], y2: y },
            style: { stroke: p.neutral, lineWidth: 1.5 } };
        }, z: 1 },
    ],
  });
  return (
    <ChartCard
      id="contrib"
      title={L("Risk töhfəsi", "Risk contribution")}
      subtitle={L("Boz nöqtə — portfeldəki çəki, rəngli nöqtə — pis ssenarilərdəki itkiyə töhfə (CVaR 95%, Euler bölgüsü). Vermilion — payından 1,5 dəfədən çox risk.", "Grey dot — weight in the portfolio, coloured dot — contribution to the loss in bad scenarios (CVaR 95%, Euler allocation). Vermilion — more than 1.5× its share in risk.")}
      build={build}
      deps={[res]}
      ariaLabel={L("Çəki və CVaR töhfəsi dumbbell qrafiki", "Dumbbell chart of weight and CVaR contribution")}
      height={rows.length > 8 ? "tall" : "short"}
      table={
        <table>
          <thead><tr><th>{L("Səhm", "Stock")}</th><th className="num">{L("Çəki", "Weight")}</th><th className="num">{L("CVaR payı", "CVaR share")}</th><th className="num">{L("CVaR töhfəsi", "CVaR contribution")}</th></tr></thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.symbol}><td>{r.investing_symbol}</td><td className="num">{pct(r.weight)}</td><td className="num">{pct(r.cvar_share)}</td>
                <td className="num">{money(r.cvar_contribution, res.base_currency)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function Correlation({ res }: { res: RunResult }) {
  const c = res.correlation!;
  const syms = c.symbols.map((s) => res.assets.find((a) => a.symbol === s)?.investing_symbol ?? s);
  const data: [number, number, number][] = [];
  c.matrix.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v])));
  const dark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 80, right: 80, top: 16, bottom: 60 },
    xAxis: { type: "category", data: syms, ...axisStyle(p), splitLine: { show: false }, axisLabel: { color: p.muted, rotate: 40 } },
    yAxis: { type: "category", data: syms, ...axisStyle(p), splitLine: { show: false }, inverse: true },
    visualMap: { min: -1, max: 1, calculable: false, orient: "vertical", right: 0, top: "middle", itemHeight: 140,
      text: ["+1", "−1"], textStyle: { color: p.muted },
      inRange: { color: ["#2c6db5", dark ? "#3b414c" : "#d6d9de", "#c23b31"] } },
    tooltip: { ...baseOption(p).tooltip, formatter: (x: unknown) => {
      const v = (x as { value: [number, number, number] }).value;
      return `${syms[v[1]]} / ${syms[v[0]]}: ${dec(v[2].toFixed(2))}`;
    } },
    series: [{ type: "heatmap", data, label: { show: syms.length <= 10, color: p.fg, fontSize: 12,
      formatter: (x: { value: unknown }) => dec((x.value as number[])[2].toFixed(2)) } }],
  });
  return (
    <ChartCard
      id="corr"
      title={L("Korrelyasiya", "Correlation")}
      subtitle={L("Klasterlərə görə sıralanıb. Göy — əks hərəkət, boz — əlaqə yoxdur, qırmızı — birlikdə hərəkət.", "Ordered by cluster. Blue — moving in opposite directions, grey — no link, red — moving together.")}
      build={build}
      deps={[res, dark]}
      ariaLabel={L("Korrelyasiya istilik xəritəsi", "Correlation heat map")}
      height={syms.length > 10 ? "tall" : undefined}
      table={
        <table>
          <thead><tr><th />{syms.map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
          <tbody>
            {c.matrix.map((row, i) => (
              <tr key={i}><th>{syms[i]}</th>{row.map((v, j) => <td key={j} className="num">{dec(v.toFixed(2))}</td>)}</tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

const FACTOR_WORD: Record<string, string> = { market: L("bazar", "market"), rates: L("faiz", "rates"), oil: L("neft", "oil"), usd: L("dollar", "dollar"), gold: L("qızıl", "gold"), vix: "VIX" };

/** "bazar −20%, faiz +100 bp" for a hypothetical scenario; the period for a historical one. */
function stressWhat(s: StressItem): string {
  if (s.type === "historical") {
    const [a, b] = (s.period ?? "").split(" – ");
    return a && b ? `${dateAz(a)} – ${dateAz(b)}` : "";
  }
  return Object.entries(s.shocks ?? {})
    .map(([f, v]) => `${FACTOR_WORD[f] ?? f} ${f === "rates" ? `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)} bp` : pct(v, { sign: true })}`)
    .join(", ");
}

type StressView = "worst" | "historical" | "hypothetical" | "all";

/** Stress scenarios; with showLimit the risk limit is drawn as a reference line (the CRO's question:
 *  "which past crises would break our risk appetite?"). Many scenarios: the worst ones first, filterable. */
export function Stress({ res, unit, showLimit }: { res: RunResult; unit: Unit; showLimit?: boolean }) {
  const ccy = res.base_currency;
  const [view, setView] = useState<StressView>("worst");
  const all = [...res.stress].sort((a, b) => b.loss_money - a.loss_money);
  const worstN = 12;
  const shown = view === "worst" ? all.slice(0, worstN) : view === "all" ? all : all.filter((s) => s.type === view);
  const rows = [...shown].reverse(); // the chart draws bottom-up: worst at the top
  const beyond = res.risk_limit ? all.filter((s) => s.loss_pct > res.risk_limit).length : 0;
  const val = (s: StressItem) => (unit === "money" ? s.pnl_money : -s.loss_pct * 100);
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 210, right: 40, top: 16, bottom: 36 },
    yAxis: { type: "category", data: rows.map((s) => s.name), ...axisStyle(p), splitLine: { show: false },
      axisLabel: { color: p.muted, fontSize: 12, width: 200, overflow: "truncate" } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v: number) => (unit === "money" ? money(v, ccy) : pct(v / 100)) } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: unknown) => {
        const s = rows[(ps as { dataIndex: number }[])[0].dataIndex];
        return `<b>${s.name}</b><br/>${stressWhat(s)}<br/>${L("Portfel", "Portfolio")}: ${money(s.pnl_money, ccy, { sign: true })} (${pct(-s.loss_pct, { sign: true })})`;
      } },
    series: [{
      type: "bar", barWidth: "60%", data: rows.map((s) => ({ value: val(s), itemStyle: { color: val(s) < 0 ? p.neg : p.pos } })),
      ...(showLimit && res.risk_limit ? {
        markLine: { symbol: "none", silent: true, lineStyle: { color: p.warn, type: "dashed" as const, width: 1.5 },
          label: { formatter: L("risk limiti", "risk limit"), color: p.warn, fontSize: 12, position: "insideEndTop" as const },
          data: [{ xAxis: unit === "money" ? -res.risk_limit * res.V0 : -res.risk_limit * 100 }] },
      } : {}),
    }],
  });
  const filters: [StressView, string][] = [
    ["worst", `${L("Ən pis", "Worst")} ${worstN}`],
    ["historical", `${L("Tarixi", "Historical")} (${all.filter((s) => s.type === "historical").length})`],
    ["hypothetical", `${L("Hipotetik", "Hypothetical")} (${all.filter((s) => s.type === "hypothetical").length})`],
    ["all", `${L("Hamısı", "All")} (${all.length})`],
  ];
  return (
    <ChartCard
      id="stress"
      title={`${L("Stress testləri", "Stress tests")} · ${all.length} ${L("ssenari", "scenarios")}`}
      subtitle={L("Ssenaridir, ehtimal deyil: bu hadisə təkrarlansa portfel təxminən bu qədər dəyişərdi. Tarixi epizodlarda hər səhmin həmin dövrdəki faktiki gəliri (o vaxt bazarda yoxdursa — bazar betası ilə), hipotetiklərdə faktor şoklarına həssaslığı istifadə olunur.",
        "A scenario, not a probability: if this event happened again the portfolio would change by about this much. Historical episodes use each stock's actual return in that period (via its market beta if it was not listed then); hypothetical ones use its sensitivity to factor shocks.")
        + (showLimit && res.risk_limit ? L(` Qırıq xətt — risk limitiniz; ${beyond} ssenari onu aşır.`, ` Dashed line — your risk limit; ${beyond} scenarios exceed it.`) : "")}
      build={build}
      deps={[res, unit, showLimit, view]}
      ariaLabel={L("Stress ssenariləri üzrə portfel dəyişikliyi", "Portfolio change by stress scenario")}
      height={rows.length > 8 ? "tall" : "short"}
      chartHeight={Math.max(260, rows.length * 26 + 70)}
      extra={
        <div className="toggle" role="group" aria-label={L("Ssenari filtri", "Scenario filter")}>
          {filters.map(([k, label]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>)}
        </div>
      }
      table={
        <table>
          <thead><tr><th>{L("Ssenari", "Scenario")}</th><th>{L("Dövr / şok", "Period / shock")}</th><th className="num">{L("Portfel", "Portfolio")}</th><th>{L("Ən çox təsirlənən", "Most affected")}</th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.name}>
                <td>{s.name}<div className="small muted">{s.type === "historical" ? L("tarixi", "historical") : L("hipotetik", "hypothetical")}{s.group ? ` · ${s.group}` : ""}</div></td>
                <td className="small">{stressWhat(s)}
                  {s.type === "historical" && s.coverage != null && s.coverage < 0.999 && (
                    <div className="muted">{s.coverage > 0 ? L(`${pct(s.coverage)} faktiki, qalanı bazar betası ilə`, `${pct(s.coverage)} actual, the rest via market beta`) : L("bazar betası ilə (o vaxt səhmlər yox idi)", "via market beta (the stocks were not listed then)")}</div>
                  )}
                </td>
                <td className={`num ${signClass(s.pnl_money)}`}>{money(s.pnl_money, ccy, { sign: true })}<div className="small">{pct(-s.loss_pct, { sign: true })}</div></td>
                <td className="small">{[...s.by_asset].sort((a, b) => b.loss_money - a.loss_money).slice(0, 3)
                  .map((a) => `${a.name} ${isFinite(a.return) ? pct(a.return, { sign: true }) : "—"}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export function Glossary({ res, children }: { res: RunResult; children?: ReactNode }) {
  const s = res.sensitivity_zero_drift;
  return (
    <section className="card" id="glossary">
      <h2>{L("Fərziyyələr və lüğət", "Assumptions and glossary")}</h2>
      <ul className="small">
        <li>{L(`Dövr: son məlumat günündən ${res.horizon_days} ticarət günü. Bütün rəqəmlər eyni run-dan, eyni valyutada (${res.base_currency}).`, `Period: ${res.horizon_days} trading days from the last data day. Every number comes from the same run, in the same currency (${res.base_currency}).`)}</li>
        <li>{L(`Qiymətlər ${int(res.scenarios)} ssenari ilə simulyasiya olunub; normal paylanma fərz edilmir. Volatillik və korrelyasiya zamanla dəyişə bilir.`, `Prices are simulated with ${int(res.scenarios)} scenarios; no normal distribution is assumed. Volatility and correlation can change over time.`)}</li>
        <li>{L(`Gözlənilən gəlir bazar riskinə görə (CAPM) götürülüb. Həssaslıq yoxlaması — “gəlir = 0” fərziyyəsi ilə: median dəyər ${money(s.median_value, res.base_currency)}, mənfəətdə olma ${prob(s.prob_profit)}, VaR 95% ${pct(s.var95_pct)}.`, `Expected return follows market risk (CAPM). Sensitivity check with “return = 0”: median value ${money(s.median_value, res.base_currency)}, in profit ${prob(s.prob_profit)}, VaR 95% ${pct(s.var95_pct)}.`)}</li>
        <li>{L("Valyuta riski modelə daxildir: hər səhmin qiyməti gündəlik məzənnə ilə əsas valyutaya çevrilir.", "Currency risk is in the model: each stock's price is converted to the base currency at the daily exchange rate.")}</li>
        <li>{L("Diversifikasiya: effektiv səhm sayı", "Diversification: effective number of stocks")} ≈ {dec(res.concentration.effective_n.toFixed(1))}.</li>
      </ul>
      <dl className="glossary small">
        {children}
        <dt>{L("Model necə qurulur", "How the model is built")}</dt>
        <dd>
          {L("Hər Generate-də model ən son məlumatla yenidən qiymətləndirilir. Hər səhm üçün son illərin gündəlik gəlirləri götürülür; volatilliyin zamanla dəyişməsi GARCH ailəsindən bir modellə öyrənilir (bir neçə variant arasından ən uyğunu statistik meyarla seçilir), səhmlər arasındakı əlaqə korrelyasiya modeli ilə. Sonra keçmişdə baş vermiş real gündəlik “şok”lar təsadüfi seçilərək minlərlə 3 aylıq ssenari qurulur. Bütün rəqəmlər bu ssenarilərdən hesablanır.",
            "Each Generate re-estimates the model on the latest data. Daily returns of recent years are taken for each stock; how volatility changes over time is learned with a GARCH-family model (the best of several variants is chosen by a statistical criterion), and the links between stocks with a correlation model. Then real daily “shocks” from the past are drawn at random to build thousands of 3-month scenarios. Every number is computed from these scenarios.")}
        </dd>
        <dt>{L("VaR və CVaR", "VaR and CVaR")}</dt>
        <dd>{L(`Ayrıca model deyil, ssenarilərdən çıxarılan ölçülərdir. ${int(res.scenarios)} ssenari pisdən yaxşıya sıralanır: VaR 95% — pis 5%-in sərhədi; CVaR 95% — ən pis 5% ssenarinin orta itkisi.`, `Not separate models but measures read from the scenarios. The ${int(res.scenarios)} scenarios are sorted from worst to best: VaR 95% — the edge of the worst 5%; CVaR 95% — the average loss of the worst 5%.`)}</dd>
        <dt>{L("50% və 90% aralıqlar", "50% and 90% ranges")}</dt>
        <dd>{L("Ortadakı ssenarilərdir. Faktiki nəticə təxminən hər iki haldan birində 50% aralığın, 10 haldan birində isə 90% aralığın kənarına çıxır. Bu normaldır.", "The middle scenarios. The actual result falls outside the 50% range about one time in two and outside the 90% range one time in ten. That is normal.")}</dd>
        <dt>{L("Median", "Median")}</dt>
        <dd>{L("Adətən bugünkü dəyərə yaxın olur və “proqnoz qiymət” deyil. Əsas dəyərli məlumat aralıqlarda və ehtimallardadır.", "Usually close to today's value and not a “price forecast”. The valuable information is in the ranges and probabilities.")}</dd>
        <dt>{L("Toxunma ehtimalı", "Touch probability")}</dt>
        <dd>{L("Dövr ərzində müəyyən səviyyəyə toxunma ehtimalı adətən dövrün sonunda həmin səviyyədə olma ehtimalından təxminən iki dəfə yüksəkdir.", "The probability of touching a level during the period is usually about twice that of ending at it.")}</dd>
        <dt>{L("Etibarlılıq", "Reliability")}</dt>
        <dd>{L("Aralığın eni və portfel üzrə nəticələr adətən yüksək, ayrı səhmlər orta, ekstremal hallar (99%) orta-aşağı, median (istiqamət) aşağı etibarlılığa malikdir.", "Range widths and portfolio-level results usually have high reliability, individual stocks medium, extreme cases (99%) medium-low and the median (direction) low.")}</dd>
      </dl>
    </section>
  );
}
