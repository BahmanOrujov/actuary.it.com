import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useState } from "react";
import { AssetResult, RunResult, RunView } from "../api";
import { ReliabilityBadge } from "../components/Badges";
import { axisStyle, baseOption, ChartCard, Palette } from "../components/Chart";
import { dateAz, frequency, int, money, pct, price, prob } from "../format";
import { t } from "../i18n";
import { NoResults, usePortfolio } from "./PortfolioLayout";

type Unit = "money" | "pct";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Compact axis label for fractions: 0.1 -> "10%", 0.025 -> "2,5%". */
function pctAxis(v: number): string {
  const x = Math.round(v * 1000) / 10;
  return `${x < 0 ? "−" : ""}${Number.isInteger(x) ? Math.abs(x) : Math.abs(x).toFixed(1).replace(".", ",")}%`;
}

function signClass(v: number) {
  return v > 0 ? "pos" : v < 0 ? "neg" : "";
}

/** P(X >= x) from the 1..99 percentile grid (resolution ~1 percentage point). */
function probAbove(q: number[], x: number): { p: number; bound: "lt" | "gt" | null } {
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

const SECTIONS: [string, string][] = [
  ["summary", "Xülasə"], ["fan", "Proqnoz"], ["pnl", "Mənfəət/zərər"], ["dist", "Risk"], ["stocks", "Səhmlər"],
  ["stress", "Stress"], ["trust", "Etibarlılıq"], ["glossary", "Lüğət"],
];

export default function Dashboard() {
  const { run, runLoaded } = usePortfolio();
  const [cp, setCp] = useState(0);
  const [level, setLevel] = useState<"0.95" | "0.99">("0.95");
  const [unit, setUnit] = useState<Unit>("money");
  const [asset, setAsset] = useState<string>("__portfolio");
  const [showPaths, setShowPaths] = useState(true);

  const res = run?.status === "done" ? run.result : undefined;
  const nCp = res?.checkpoints.length ?? 0;
  useEffect(() => {
    if (nCp) setCp(nCp - 1);
  }, [run?.id, nCp]);

  if (!run || !res) return <NoResults run={run} runLoaded={runLoaded} />;

  const ccy = res.base_currency;
  const risk = res.risk[level] ?? res.risk["0.95"];
  const levelShown = res.risk[level] ? level : "0.95";
  const end = res.checkpoints[res.checkpoints.length - 1];
  const r95 = res.risk["0.95"];
  const fmtV = (v: number) => (unit === "money" ? money(v, ccy) : pct(v / res.V0 - 1, { sign: true }));
  const fmtPnl = (v: number) => (unit === "money" ? money(v, ccy, { sign: true }) : pct(v / res.cost_total, { sign: true }));

  return (
    <>
      {res.warnings.map((w) => (
        <div key={w} className="banner warn"><span className="ic">⚠</span> {w}</div>
      ))}

      {/* 0. Header and filters */}
      <div className="toolbar" id="summary" role="group" aria-label="Filtrlər">
        <div className="wide small muted">
          <div><b style={{ color: "var(--fg)" }}>Məlumat tarixi:</b> {dateAz(res.as_of)}</div>
          <div><b style={{ color: "var(--fg)" }}>Dövrün sonu:</b> {dateAz(res.horizon_end)} ({res.horizon_days} ticarət günü) · {ccy}</div>
        </div>
        <label>
          Aralıq tarix
          <select value={cp} onChange={(e) => setCp(Number(e.target.value))}>
            {res.checkpoint_dates.map((d, i) => (
              <option key={d} value={i}>{dateAz(d)}</option>
            ))}
          </select>
        </label>
        <label>
          VaR səviyyəsi
          <select value={level} onChange={(e) => setLevel(e.target.value as "0.95" | "0.99")}>
            <option value="0.95">95%</option>
            <option value="0.99" disabled={!res.risk["0.99"]}>99%{!res.risk["0.99"] ? " (gizlədilib)" : ""}</option>
          </select>
        </label>
        <div>
          <div className="small muted" style={{ marginBottom: 4, fontWeight: 500 }}>Göstərmə</div>
          <div className="toggle" role="group" aria-label="Vahid">
            <button aria-pressed={unit === "money"} onClick={() => setUnit("money")}>Məbləğ</button>
            <button aria-pressed={unit === "pct"} onClick={() => setUnit("pct")}>%</button>
          </div>
        </div>
        <label className="wide">
          Səhm
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="__portfolio">Bütün portfel</option>
            {res.assets.map((a) => (
              <option key={a.symbol} value={a.symbol}>{a.investing_symbol} — {a.name}</option>
            ))}
          </select>
        </label>
      </div>

      <nav className="section-nav" aria-label="Nəticələrin bölmələri">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}>{label}</a>)}
      </nav>

      <div className="hero">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Qısa cavab</div>
        <p className="big">
          {dateAz(res.horizon_end)} tarixinə portfelin dəyəri ssenarilərin 90%-ində{" "}
          <b>{money(end.p05, ccy)} – {money(end.p95, ccy)}</b> aralığında qalır; ortadakı ssenari (median) <b>{money(end.median, ccy)}</b>.
          Ən pis 5% ssenaridə orta itki <b>{money(r95.cvar_money, ccy)}</b> ({pct(r95.cvar_pct)}).
          Maya dəyərindən yuxarıda bitmə ehtimalı <b>{prob(res.pnl_end.prob_profit)}</b>.
        </p>
        <div className="row-actions small">
          <span className="muted">Bu rəqəmlərin etibarlılığı:</span> <ReliabilityBadge level={run.reliability} />
          <a href="#trust" onClick={(e) => {
            e.preventDefault();
            document.getElementById("trust")?.scrollIntoView({ behavior: "smooth" });
          }}>nə qədər güvənmək olar →</a>
        </div>
      </div>

      {/* 1. KPI cards, grouped: today -> end of period -> risk */}
      <div className="kpi-groups">
        <div className="kpi-group">
          <div className="eyebrow">Bu gün</div>
          <div className="kpi-row">
            <Kpi label="Cari dəyər" value={money(res.V0, ccy)} sub={`maya dəyəri ${money(res.cost_total, ccy)}`} />
            <Kpi label="Cari mənfəət/zərər" value={money(res.current.total.unrealized, ccy, { sign: true })}
              sub={`${pct(res.current.total.unrealized_pct, { sign: true })} açıq mövqelər · reallaşmış ${money(res.current.total.realized, ccy, { sign: true })}` +
                ` · dividend ${money(res.current.total.dividends ?? 0, ccy)}`} />
          </div>
        </div>
        <div className="kpi-group">
          <div className="eyebrow">Dövrün sonunda · {dateAz(res.horizon_end)}</div>
          <div className="kpi-row">
            <Kpi label="Median dəyər" value={money(end.median, ccy)} sub={`m/z medianı ${money(end.pnl_median, ccy, { sign: true })}`} />
            <Kpi label="90% aralıq" value={`${money(end.p05, ccy)} – ${money(end.p95, ccy)}`} sub="10 haldan 9-da nəticə bu aralıqda olur" />
            <Kpi label="Mənfəətdə olma ehtimalı" value={prob(res.pnl_end.prob_profit)} sub="maya dəyərindən yuxarı" />
          </div>
        </div>
        <div className="kpi-group">
          <div className="eyebrow">Risk · 3 ay</div>
          <div className="kpi-row">
            <Kpi label={`VaR ${Number(levelShown) * 100}%`} value={money(risk.var_money, ccy)}
              sub={`${pct(risk.var_pct)} · ${frequency(1 - Number(levelShown))} itki bundan çox olur`} />
            <Kpi label={`CVaR ${Number(levelShown) * 100}%`} value={money(risk.cvar_money, ccy)}
              sub={`${pct(risk.cvar_pct)} · ən pis ${Math.round((1 - Number(levelShown)) * 100)}% ssenarinin orta itkisi`} />
          </div>
        </div>
      </div>
      {res.hidden_99 && (
        <div className="banner warn"><span className="ic">⚠</span> Model bəzi yoxlamalardan keçmədiyi üçün 99% göstəriciləri gizlədilib.</div>
      )}

      {/* 2. Fan chart */}
      <FanChart res={res} unit={unit} asset={asset} showPaths={showPaths} setShowPaths={setShowPaths} />

      {/* 3. Checkpoints table */}
      <section className="card" id="checkpoints">
        <div className="card-head">
          <div>
            <h2>Aralıq tarixlər</h2>
            <div className="sub">Seçilmiş tarix vurğulanıb. Ehtimallar maya dəyərinə nisbətən hesablanır.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarix</th><th className="num">Median</th><th className="num">50% aralıq</th><th className="num">90% aralıq</th>
                <th className="num">M/z (median)</th><th className="num">Mənfəətdə olma</th>
                <th className="num">5%+ itki</th><th className="num">10%+ itki</th><th className="num">20%+ itki</th>
              </tr>
            </thead>
            <tbody>
              {res.checkpoints.map((c, i) => (
                <tr key={c.h} className={i === cp ? "current" : undefined}>
                  <td>{dateAz(res.checkpoint_dates[i])}</td>
                  <td className="num">{fmtV(c.median)}</td>
                  <td className="num">{fmtV(c.p25)} – {fmtV(c.p75)}</td>
                  <td className="num">{fmtV(c.p05)} – {fmtV(c.p95)}</td>
                  <td className={`num ${signClass(c.pnl_median)}`}>{fmtPnl(c.pnl_median)}</td>
                  <td className="num">{prob(c.prob_profit_vs_cost)}</td>
                  {["0.05", "0.1", "0.2"].map((k) => (
                    <td className="num" key={k}>{prob(c.prob_loss_over[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. P&L by position */}
      <PnlSection res={res} cp={cp} unit={unit} />

      {/* 5. End distribution */}
      <Distribution res={res} level={levelShown} />

      {/* 6. Drawdown */}
      <Drawdown res={res} />

      {/* 7. Stocks */}
      <StocksSection res={res} />

      {/* 8. Risk contribution */}
      {res.assets.length > 1 && <RiskContribution res={res} />}

      {/* 9. Correlation */}
      {res.correlation && <Correlation res={res} />}

      {/* 10. Stress */}
      <Stress res={res} unit={unit} />

      {/* 11. Reliability */}
      <TrustPanel run={run} />

      {/* 12. Assumptions and glossary */}
      <Glossary res={res} />
      <p className="disclaimer">{run.disclaimer}</p>
    </>
  );
}

const LEVEL_WORD: Record<string, string> = { high: "Yüksək", medium: "Orta", low: "Aşağı", checking: "Yoxlanılır" };

/** Expected vs observed as two bars on one scale. */
function VsBars({ expected, observed, fmt }: { expected: number; observed: number; fmt: (v: number) => string }) {
  const max = Math.max(expected, observed, 1e-9);
  return (
    <div className="vs" aria-hidden="true">
      <div className="vs-row"><span>gözlənilən</span><div className="vs-bar"><div className="exp" style={{ width: `${(expected / max) * 100}%` }} /></div><span className="num">{fmt(expected)}</span></div>
      <div className="vs-row"><span>faktiki</span><div className="vs-bar"><div className="obs" style={{ width: `${(observed / max) * 100}%` }} /></div><span className="num">{fmt(observed)}</span></div>
    </div>
  );
}

/** What each kind of number on this page can be trusted for (PROMPT.md 12 labels, with the reason). */
const NUMBER_TRUST: { item: string; level: string; why: string }[] = [
  { item: "Aralıqların eni (50%, 90%) və portfel üzrə nəticələr", level: "high",
    why: "Volatillik və korrelyasiya modelləri ən yaxşı bunu ölçür; keçmiş məlumatda yoxlanılır." },
  { item: "Portfelin VaR və CVaR 95%-i", level: "high",
    why: "Hər gün üçün keçmişdə proqnoz verilib və faktiki itkilərlə tutuşdurulub (yuxarıdakı rəqəmlər)." },
  { item: "Ayrı səhmlər üzrə aralıqlar və ehtimallar", level: "medium",
    why: "Bir şirkətin xəbərləri (hesabat, birləşmə) modeldə yoxdur; tək səhmdə səs-küy çoxdur." },
  { item: "Ekstremal hallar (99%, drawdown quyruğu)", level: "medium-low",
    why: "Nadir hadisələr keçmişdə az müşahidə olunub, quyruğun forması qeyri-müəyyəndir." },
  { item: "Median və qalxma/düşmə istiqaməti", level: "low",
    why: "Qiymətin istiqamətini heç bir model etibarlı proqnozlaşdıra bilmir. Median ortadakı ssenaridir, proqnoz qiymət deyil." },
];

function TrustPanel({ run }: { run: RunView }) {
  const tr = run.trust;
  const lvl = run.reliability;
  const times = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}`;
  return (
    <section className="card" id="trust">
      <div className="card-head">
        <div>
          <h2>Bu rəqəmlərə nə qədər güvənə bilərəm?</h2>
          <div className="sub">
            Model keçmiş məlumatda sınanıb: əvvəlki tarixlərdə verdiyi aralıqlar sonradan baş verən faktiki nəticələrlə müqayisə olunub.
          </div>
        </div>
      </div>
      <div className="trust-top">
        <div>
          <div className="eyebrow">Ümumi etibarlılıq</div>
          <div className="level-word">{LEVEL_WORD[lvl] ?? lvl}</div>
          <div className={`meter ${lvl}`} aria-hidden="true"><span /><span /><span /><span /></div>
          <p className="small muted">{run.reliability_text}</p>
          {tr && (
            <p className="small">
              {tr.checks_passed} / {tr.checks_total} statistik yoxlamadan keçib.
              {tr.fallback_model && " Əsas model yoxlamalardan keçmədiyi üçün daha ehtiyatlı alternativ model istifadə olunub."}
            </p>
          )}
        </div>
        {tr ? (
          <div className="facts">
            {tr.var95 && (
              <div className="fact">
                <div className="fact-q">Pis gün sərhədi (gündəlik VaR 95%)</div>
                <div className="fact-a">{tr.var95.observed} dəfə aşılıb · gözlənilən ~{times(tr.var95.expected)}</div>
                <VsBars expected={tr.var95.expected} observed={tr.var95.observed} fmt={times} />
                <div className="fact-n">Son {tr.backtest_days} ticarət günündə ({tr.backtest_months} ay) itki bu sərhədi təxminən 20 gündən 1-də keçməli idi.</div>
              </div>
            )}
            {tr.var99 && (
              <div className="fact">
                <div className="fact-q">Çox pis gün (gündəlik VaR 99%)</div>
                <div className="fact-a">{tr.var99.observed} dəfə aşılıb · gözlənilən ~{times(tr.var99.expected)}</div>
                <VsBars expected={tr.var99.expected} observed={tr.var99.observed} fmt={times} />
                <div className="fact-n">100 gündən 1-də gözlənilir. Hadisə az olduğu üçün bu müqayisə daha qeyri-dəqiqdir.</div>
              </div>
            )}
            {tr.cover90 && (
              <div className="fact">
                <div className="fact-q">3 aylıq 90% aralıq tuturdumu?</div>
                <div className="fact-a">{pct(tr.cover90.observed)} hallarda içində · hədəf {pct(tr.cover90.nominal)}</div>
                <VsBars expected={tr.cover90.nominal} observed={tr.cover90.observed} fmt={(v) => pct(v)} />
                <div className="fact-n">
                  {tr.windows_3m} üç aylıq dövr yoxlanılıb, amma onlar üst-üstə düşür: bir-birindən tam asılı olmayan cəmi{" "}
                  {tr.cover90.independent_windows} dövr var. Ona görə 3 aylıq yoxlama gündəlikdən zəifdir.
                </div>
              </div>
            )}
            {tr.cover50 && (
              <div className="fact">
                <div className="fact-q">3 aylıq 50% aralıq tuturdumu?</div>
                <div className="fact-a">{pct(tr.cover50.observed)} hallarda içində · hədəf {pct(tr.cover50.nominal)}</div>
                <VsBars expected={tr.cover50.nominal} observed={tr.cover50.observed} fmt={(v) => pct(v)} />
                <div className="fact-n">Faktiki nəticənin təxminən hər iki haldan birində bu aralıqdan kənara çıxması normaldır.</div>
              </div>
            )}
            {tr.mc_rel_error != null && (
              <div className="fact">
                <div className="fact-q">Simulyasiyanın dəqiqliyi</div>
                <div className="fact-a">±{pct(tr.mc_rel_error)} nisbi xəta</div>
                <div className="fact-n">
                  {int(tr.scenarios)} ssenari hesablanıb. VaR və CVaR təkrar hesablansa, təsadüfi fərq təxminən bu qədər olar — modelin
                  özünün xətası bundan böyükdür.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="banner info">
            {run.validation_status === "failed"
              ? "Keçmiş məlumatda yoxlama aparıla bilmədi (məlumat azdır). Nəticələri ehtiyatla şərh edin."
              : "Keçmiş məlumatda yoxlama davam edir. Bitəndə bu bölmə avtomatik yenilənəcək."}
          </div>
        )}
      </div>

      <h3>Hansı rəqəmə nə qədər güvənmək olar</h3>
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
              <td>Stress testləri</td>
              <td><span className="badge checking">ssenari</span></td>
              <td className="small muted">Ehtimal deyil: “bu hadisə təkrarlansa nə olardı” sualına cavabdır.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 18 }}>Modelin bilmədiyi şeylər</h3>
      <ul className="notknow">
        <li>Şirkət xəbərləri, maliyyə hesabatları, birləşmələr — model yalnız qiymət tarixçəsinə baxır.</li>
        <li>Son {tr?.history_years ?? 5} ilin məlumatında olmayan tip böhranlar və bazar rejimləri.</li>
        <li>Faiz, inflyasiya, siyasi qərarlar kimi makro dəyişikliklər birbaşa daxil deyil.</li>
        <li>Likvidlik: böyük mövqeni tez satmaq qiyməti özü dəyişə bilər.</li>
        <li>Gələcək dividend və korporativ hadisələr (bölünmə, geri alış).</li>
        <li>Faktiki nəticə 10 haldan 1-də 90% aralığın kənarına çıxır — bu səhv deyil, aralığın tərifidir.</li>
      </ul>
      <p className="small muted" style={{ marginTop: 10 }}>
        Model necə qurulur: <a href="#glossary" onClick={(e) => {
          e.preventDefault();
          document.getElementById("glossary")?.scrollIntoView({ behavior: "smooth" });
        }}>fərziyyələr və lüğət</a>. {t("results")} investisiya tövsiyəsi deyil.
      </p>
    </section>
  );
}

function FanChart({ res, unit, asset, showPaths, setShowPaths }: {
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
      axisLabel: { color: p.muted, fontSize: 11, formatter: (v: string) => dateAz(v).slice(0, 5) } },
    yAxis: { type: "value", min: lo - padY, max: hi + padY, ...axisStyle(p),
      axisLabel: { color: p.muted, fontSize: 11, formatter: (v: number) => fmt(v), showMinLabel: false, showMaxLabel: false } },
    tooltip: {
      ...baseOption(p).tooltip,
      trigger: "axis",
      formatter: (params: unknown) => {
        const ps = params as { dataIndex: number }[];
        const i = ps[0]?.dataIndex ?? 0;
        const d = dates[i];
        const fi = i - hist.values.length;
        if (fi < 0) return `${dateAz(d)}<br/>Keçmiş dəyər (cari say ilə): <b>${fmt(conv(hist.values[i]))}</b>`;
        const r = fan[fi];
        return `${dateAz(d)}<br/>95-ci persentil: ${fmt(conv(r[4]))}<br/>75-ci: ${fmt(conv(r[3]))}<br/>` +
          `<b>Median: ${fmt(conv(r[2]))}</b><br/>25-ci: ${fmt(conv(r[1]))}<br/>5-ci: ${fmt(conv(r[0]))}`;
      },
    },
    series: [
      { name: "90% lower", type: "line", data: pad(fan.map((r) => conv(r[0]))), stack: "b90", symbol: "none",
        lineStyle: { opacity: 0 }, silent: true },
      { name: "90% aralıq", type: "line", data: pad(fan.map((r) => conv(r[4]) - conv(r[0]))), stack: "b90", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: p.bandLight }, silent: true },
      { name: "50% lower", type: "line", data: pad(fan.map((r) => conv(r[1]))), stack: "b50", symbol: "none",
        lineStyle: { opacity: 0 }, silent: true },
      { name: "50% aralıq", type: "line", data: pad(fan.map((r) => conv(r[3]) - conv(r[1]))), stack: "b50", symbol: "none",
        lineStyle: { opacity: 0 }, areaStyle: { color: p.bandDark }, silent: true },
      ...(!a && showPaths
        ? res.sample_paths.map((sp, k) => ({
            name: `ssenari ${k + 1}`, type: "line" as const, data: pad(sp.map(conv)), symbol: "none",
            lineStyle: { color: p.neutral, width: 0.7, opacity: 0.6 }, silent: true,
          }))
        : []),
      { name: "Median", type: "line", data: pad(fan.map((r) => conv(r[2]))), symbol: "none",
        lineStyle: { color: p.q, width: 1.5, type: "dashed" } },
      { name: "Keçmiş dəyər", type: "line", data: histSeries, symbol: "none", lineStyle: { color: p.fg, width: 1.3 },
        markLine: {
          silent: true, symbol: "none", label: { color: p.muted, fontSize: 11 },
          data: [
            ...(hist.values.length ? [{ xAxis: hist.values.length - 1, lineStyle: { color: p.muted, type: "solid" as const }, label: { formatter: "bu gün" } }] : []),
            ...(cost != null ? [{ yAxis: conv(cost), lineStyle: { color: p.warn, type: "dotted" as const, width: 1.2 }, label: { formatter: "maya dəyəri", position: "insideEndTop" as const } }] : []),
          ],
        } },
    ],
  });

  const table = (
    <table>
      <thead>
        <tr><th>Tarix</th><th className="num">5%</th><th className="num">25%</th><th className="num">Median</th><th className="num">75%</th><th className="num">95%</th></tr>
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
      title={a ? `${a.investing_symbol}: gündəlik paylanma (${res.base_currency})` : "Portfelin dəyəri: harada olacağam?"}
      subtitle="Açıq zolaq — 90% aralıq, tünd zolaq — 50% aralıq, qırıq xətt — median (proqnoz qiymət deyil). Nöqtəli xətt — maya dəyəri."
      build={build}
      table={table}
      height="tall"
      ariaLabel="Portfel dəyərinin ehtimal paylanması qrafiki"
      deps={[res, unit, asset, showPaths]}
      extra={!a && (
        <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} /> nümunə ssenarilər
        </label>
      )}
    />
  );
}

function PnlSection({ res, cp, unit }: { res: RunResult; cp: number; unit: Unit }) {
  const ccy = res.base_currency;
  const c = res.checkpoints[cp];
  const f = (v: number, base: number) => (unit === "money" ? money(v, ccy, { sign: true }) : pct(base ? v / base : 0, { sign: true }));
  return (
    <section className="card" id="pnl">
      <h2>Mənfəət/zərər</h2>
      <p className="muted small">
        {dateAz(res.checkpoint_dates[cp])} tarixində portfel üzrə mənfəət/zərər: median {f(c.pnl_median, res.cost_total)},
        50% aralıq {f(c.pnl_p25, res.cost_total)} … {f(c.pnl_p75, res.cost_total)}, 90% aralıq {f(c.pnl_p05, res.cost_total)} … {f(c.pnl_p95, res.cost_total)}.
        Mövqelər üzrə aralıqlar dövrün sonuna aiddir. Dövrün sonunda maya dəyərinə nisbətən 10%-dən çox zərər ehtimalı{" "}
        {prob(res.pnl_end.prob_loss_over["0.1"])};{" "}
        {res.pnl_end.loss_cvar95_vs_cost > 0
          ? `ən pis 5% ssenaridə orta zərər ${money(res.pnl_end.loss_cvar95_vs_cost, ccy)}.`
          : `ən pis 5% ssenaridə belə orta nəticə maya dəyərindən ${money(-res.pnl_end.loss_cvar95_vs_cost, ccy)} yuxarıdır.`}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Səhm</th><th className="num">Say</th><th className="num">Maya dəyəri</th><th className="num">Bazar dəyəri</th>
              <th className="num">Cari m/z</th><th className="num">Reallaşmış</th><th className="num">Dividend</th><th className="num">Təxmini m/z (50%)</th>
              <th className="num">Təxmini m/z (90%)</th><th className="num">Mənfəətdə olma</th><th className="num">Maya dəyərinə qayıtma</th>
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
                  <td className="num">{a.prob_break_even != null ? prob(a.prob_break_even) : <span className="muted">mənfəətdədir</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        “Maya dəyərinə qayıtma” — hazırda zərərdə olan mövqenin dövr ərzində ən azı bir dəfə maya dəyərinə çatma ehtimalı.
        Maya dəyəri keçmişdə ödənilib; gələcək qərarlar onun əsasında verilməməlidir.
      </p>
    </section>
  );
}

function Distribution({ res, level }: { res: RunResult; level: string }) {
  const { edges, counts } = res.histogram;
  const centers = counts.map((_, i) => (edges[i] + edges[i + 1]) / 2);
  const varPct = -res.risk[level].var_pct;
  const cvarPct = -res.risk[level].cvar_pct;
  const idxOf = (x: number) => Math.max(0, Math.min(centers.length - 1, centers.findIndex((c, i) => x < edges[i + 1])));
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 56, right: 24, top: 46, bottom: 40 },
    xAxis: { type: "category", data: centers.map((c) => pct(c)), ...axisStyle(p), splitLine: { show: false },
      name: "3 aylıq gəlir", nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", ...axisStyle(p), axisLabel: { show: false }, name: "" },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis",
      formatter: (ps: unknown) => {
        const i = (ps as { dataIndex: number }[])[0].dataIndex;
        return `${pct(edges[i])} … ${pct(edges[i + 1])}<br/>${prob(counts[i] / res.scenarios)} ssenari`;
      } },
    series: [{
      type: "bar", barCategoryGap: "8%",
      data: counts.map((c, i) => ({ value: c, itemStyle: { color: centers[i] <= varPct ? p.neg : p.neutral } })),
      markLine: {
        symbol: "none", silent: true, label: { color: p.fg, fontSize: 11 },
        data: [
          { xAxis: idxOf(varPct), lineStyle: { color: p.neg, type: "solid" },
            label: { formatter: `VaR ${Number(level) * 100}%: ${pct(varPct)}`, position: "end", distance: 4 } },
          { xAxis: idxOf(cvarPct), lineStyle: { color: p.neg, type: "dashed" },
            label: { formatter: `CVaR: ${pct(cvarPct)}`, position: "end", distance: 20 } },
        ],
      },
    }],
  });
  return (
    <ChartCard
      id="dist"
      title="Ən pis halda nə qədər itirə bilərəm?"
      subtitle={`Dövrün sonunda gəlirin paylanması (${int(res.scenarios)} ssenari). Rəngli quyruq — VaR-dan pis ssenarilər.` +
        (res.histogram.below || res.histogram.above
          ? ` Ən ekstremal ${int((res.histogram.below ?? 0) + (res.histogram.above ?? 0))} ssenari (hər tərəfdə 0,1%) qrafikdən kənardadır, ölçülərə daxildir.`
          : "")}
      build={build}
      deps={[res, level]}
      ariaLabel="Dövrün sonunda gəlirin histogramı"
      table={
        <table>
          <thead><tr><th>Gəlir aralığı</th><th className="num">Ssenarilərin payı</th></tr></thead>
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

function Drawdown({ res }: { res: RunResult }) {
  const all = res.drawdown.exceedance.filter((e) => e.x > 0);
  const cut = all.findIndex((e) => e.x >= 0.15 && e.p_touch < 0.005);
  const ex = cut > 0 ? all.slice(0, cut + 1) : all;
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    legend: { top: 0, textStyle: { color: p.muted } },
    grid: { left: 56, right: 24, top: 32, bottom: 40 },
    xAxis: { type: "category", data: ex.map((e) => `−${pct(e.x)}`), ...axisStyle(p), splitLine: { show: false },
      name: "itki səviyyəsi", nameLocation: "middle", nameGap: 28 },
    yAxis: { type: "value", max: 1, ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v: number) => `${Math.round(v * 100)}%` } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", valueFormatter: (v) => prob(Number(v)) },
    series: [
      { name: "Dövr ərzində bu səviyyəyə toxunma", type: "line", data: ex.map((e) => e.p_touch), symbol: "none",
        lineStyle: { color: p.q, width: 1.6 }, itemStyle: { color: p.q } },
      { name: "Dövrün sonunda bu itkidə olma", type: "line", data: ex.map((e) => e.p_end), symbol: "none",
        lineStyle: { color: p.neutral, width: 1.4, type: "dashed" }, itemStyle: { color: p.neutral } },
    ],
  });
  const m = res.drawdown.mdd_percentiles;
  return (
    <ChartCard
      id="drawdown"
      title="Drawdown: dövr ərzində düşmə ehtimalı"
      subtitle={`Maksimal drawdown medianı ${pct(m["50"])}; 20 rübdən 1-də ${pct(m["5"])}-dən pis. Toxunma ehtimalı adətən dövrün sonunda həmin səviyyədə olma ehtimalından ~2 dəfə yüksəkdir.`}
      build={build}
      deps={[res]}
      ariaLabel="Drawdown aşma əyrisi"
      height="short"
      table={
        <table>
          <thead><tr><th>İtki</th><th className="num">Toxunma</th><th className="num">Dövrün sonunda</th><th className="num">Drawdown ≥</th></tr></thead>
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

function StocksSection({ res }: { res: RunResult }) {
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
        return `<b>${r.a.investing_symbol}</b> ${r.a.name}<br/>Median: ${pct(r.median, { sign: true })}<br/>50%: ${pct(r.lo50, { sign: true })} … ${pct(r.hi50, { sign: true })}<br/>90%: ${pct(r.lo90, { sign: true })} … ${pct(r.hi90, { sign: true })}`;
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
        title="Səhmlər: dövrün sonunda qiymət dəyişikliyi"
        subtitle="Nöqtə — median, qalın xətt — 50% aralıq, nazik xətt — 90% aralıq (əsas valyutada)."
        build={build}
        deps={[res, sortKey]}
        ariaLabel="Səhmlər üzrə interval qrafiki"
        height={res.assets.length > 8 ? "tall" : "short"}
        table={
          <table>
            <thead><tr><th>Səhm</th><th className="num">5%</th><th className="num">25%</th><th className="num">Median</th><th className="num">75%</th><th className="num">95%</th></tr></thead>
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
        <h2>Səhmlər cədvəli</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Səhm</th>{th("weight", "Çəki")}{th("median", "Median")}<th className="num">50% aralıq</th><th className="num">90% aralıq</th>
                {th("width", "Aralığın eni")}{th("prob_up", "Qalxma ehtimalı")}{th("cvar_share", "CVaR payı")}
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
        <h3 style={{ marginTop: 16 }}>Hədəf qiymət kalkulyatoru</h3>
        <div className="form-row">
          <label>
            Səhm
            <select value={calcSym} onChange={(e) => setCalcSym(e.target.value)}>
              {res.assets.map((a) => <option key={a.symbol} value={a.symbol}>{a.investing_symbol}</option>)}
            </select>
          </label>
          <label>
            Hədəf qiymət ({ca?.currency})
            <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <div style={{ flex: 2 }}>
            {pr && ca && (
              <p>
                {dateAz(res.horizon_end)} tarixində qiymətin {price(tv, ca.currency)} və ya daha yuxarı olma ehtimalı:{" "}
                <b>{pr.bound === "lt" ? "<1%" : pr.bound === "gt" ? ">99%" : prob(pr.p)}</b>
                <span className="muted small"> (cari ~{price(ca.price0 / ca.fx_to_base, ca.currency)}; dövr ərzində toxunma ehtimalı adətən təxminən iki dəfə yüksəkdir)</span>
              </p>
            )}
          </div>
        </div>
        {res.targets.length > 0 && (
          <p className="small">
            Saxlanılmış hədəflər: {res.targets.map((tg) => `${tg.symbol}: ${tg.target_price ? `hədəf — sonda ${prob(tg.prob_target)}, toxunma ${prob(tg.prob_touch_target)}` : ""}${tg.stop_loss ? ` stop-loss toxunma ${prob(tg.prob_touch_stop)}` : ""}`).join(" · ")}
          </p>
        )}
      </section>
    </>
  );
}

function RiskContribution({ res }: { res: RunResult }) {
  const rows = [...res.assets].sort((a, b) => a.cvar_share - b.cvar_share);
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    legend: { top: 0, textStyle: { color: p.muted } },
    grid: { left: 64, right: 20, top: 30, bottom: 36 },
    yAxis: { type: "category", data: rows.map((r) => r.investing_symbol), ...axisStyle(p), splitLine: { show: false } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, hideOverlap: true, formatter: pctAxis } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => pct(Number(v)) },
    series: [
      { name: "Çəki", type: "scatter", data: rows.map((r) => r.weight), symbolSize: 9, itemStyle: { color: p.neutral } },
      { name: "CVaR töhfəsi", type: "scatter", data: rows.map((r) => r.cvar_share), symbolSize: 10,
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
      title="Risk töhfəsi"
      subtitle="Boz nöqtə — portfeldəki çəki, rəngli nöqtə — pis ssenarilərdəki itkiyə töhfə (CVaR 95%, Euler bölgüsü). Vermilion — payından 1,5 dəfədən çox risk."
      build={build}
      deps={[res]}
      ariaLabel="Çəki və CVaR töhfəsi dumbbell qrafiki"
      height={rows.length > 8 ? "tall" : "short"}
      table={
        <table>
          <thead><tr><th>Səhm</th><th className="num">Çəki</th><th className="num">CVaR payı</th><th className="num">CVaR töhfəsi</th></tr></thead>
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

function Correlation({ res }: { res: RunResult }) {
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
      return `${syms[v[1]]} / ${syms[v[0]]}: ${v[2].toFixed(2).replace(".", ",")}`;
    } },
    series: [{ type: "heatmap", data, label: { show: syms.length <= 10, color: p.fg, fontSize: 10,
      formatter: (x: { value: unknown }) => (x.value as number[])[2].toFixed(2).replace(".", ",") } }],
  });
  return (
    <ChartCard
      id="corr"
      title="Korrelyasiya"
      subtitle="Klasterlərə görə sıralanıb. Göy — əks hərəkət, boz — əlaqə yoxdur, qırmızı — birlikdə hərəkət."
      build={build}
      deps={[res, dark]}
      ariaLabel="Korrelyasiya istilik xəritəsi"
      height={syms.length > 10 ? "tall" : undefined}
      table={
        <table>
          <thead><tr><th />{syms.map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
          <tbody>
            {c.matrix.map((row, i) => (
              <tr key={i}><th>{syms[i]}</th>{row.map((v, j) => <td key={j} className="num">{v.toFixed(2).replace(".", ",")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

function Stress({ res, unit }: { res: RunResult; unit: Unit }) {
  const ccy = res.base_currency;
  const rows = [...res.stress].sort((a, b) => a.loss_money - b.loss_money);
  const val = (s: (typeof rows)[number]) => (unit === "money" ? s.pnl_money : -s.loss_pct * 100);
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 110, right: 40, top: 16, bottom: 36 },
    yAxis: { type: "category", data: rows.map((s) => s.name), ...axisStyle(p), splitLine: { show: false } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v: number) => (unit === "money" ? money(v, ccy) : pct(v / 100)) } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", axisPointer: { type: "shadow" },
      valueFormatter: (v) => (unit === "money" ? money(Number(v), ccy, { sign: true }) : pct(Number(v) / 100, { sign: true })) },
    series: [{ type: "bar", barWidth: "55%", data: rows.map((s) => ({ value: val(s), itemStyle: { color: val(s) < 0 ? p.neg : p.pos } })) }],
  });
  return (
    <ChartCard
      id="stress"
      title="Stress testləri"
      subtitle="Ssenaridir, ehtimal deyil: bu hadisələr təkrarlansa, portfel təxminən bu qədər dəyişərdi."
      build={build}
      deps={[res, unit]}
      ariaLabel="Stress ssenariləri üzrə itkilər"
      height="short"
      table={
        <table>
          <thead><tr><th>Ssenari</th><th>Növ</th><th className="num">Portfel</th><th>Ən çox təsirlənən</th></tr></thead>
          <tbody>
            {[...rows].reverse().map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td><td>{s.type === "historical" ? "tarixi" : "hipotetik"}</td>
                <td className={`num ${signClass(s.pnl_money)}`}>{money(s.pnl_money, ccy, { sign: true })} ({pct(-s.loss_pct, { sign: true })})</td>
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

function Glossary({ res }: { res: RunResult }) {
  const s = res.sensitivity_zero_drift;
  return (
    <section className="card" id="glossary">
      <h2>Fərziyyələr və lüğət</h2>
      <ul className="small">
        <li>Dövr: son məlumat günündən {res.horizon_days} ticarət günü. Bütün rəqəmlər eyni run-dan, eyni valyutada ({res.base_currency}).</li>
        <li>Qiymətlər {int(res.scenarios)} ssenari ilə simulyasiya olunub; normal paylanma fərz edilmir. Volatillik və korrelyasiya zamanla dəyişə bilir.</li>
        <li>Gözlənilən gəlir bazar riskinə görə (CAPM) götürülüb. Həssaslıq yoxlaması — “gəlir = 0” fərziyyəsi ilə: median dəyər {money(s.median_value, res.base_currency)}, mənfəətdə olma {prob(s.prob_profit)}, VaR 95% {pct(s.var95_pct)}.</li>
        <li>Valyuta riski modelə daxildir: hər səhmin qiyməti gündəlik məzənnə ilə əsas valyutaya çevrilir.</li>
        <li>Diversifikasiya: effektiv səhm sayı ≈ {res.concentration.effective_n.toFixed(1).replace(".", ",")}.</li>
      </ul>
      <dl className="glossary small">
        <dt>Model necə qurulur</dt>
        <dd>
          Hər Generate-də model ən son məlumatla yenidən qiymətləndirilir. Hər səhm üçün son illərin gündəlik gəlirləri götürülür;
          volatilliyin zamanla dəyişməsi GARCH ailəsindən bir modellə öyrənilir (bir neçə variant arasından ən uyğunu statistik meyarla seçilir),
          səhmlər arasındakı əlaqə korrelyasiya modeli ilə. Sonra keçmişdə baş vermiş real gündəlik “şok”lar təsadüfi seçilərək
          minlərlə 3 aylıq ssenari qurulur. Bütün rəqəmlər bu ssenarilərdən hesablanır.
        </dd>
        <dt>VaR və CVaR</dt>
        <dd>Ayrıca model deyil, ssenarilərdən çıxarılan ölçülərdir. {int(res.scenarios)} ssenari pisdən yaxşıya sıralanır: VaR 95% — pis 5%-in sərhədi; CVaR 95% — ən pis 5% ssenarinin orta itkisi.</dd>
        <dt>50% və 90% aralıqlar</dt>
        <dd>Ortadakı ssenarilərdir. Faktiki nəticə təxminən hər iki haldan birində 50% aralığın, 10 haldan birində isə 90% aralığın kənarına çıxır. Bu normaldır.</dd>
        <dt>Median</dt>
        <dd>Adətən bugünkü dəyərə yaxın olur və “proqnoz qiymət” deyil. Əsas dəyərli məlumat aralıqlarda və ehtimallardadır.</dd>
        <dt>Toxunma ehtimalı</dt>
        <dd>Dövr ərzində müəyyən səviyyəyə toxunma ehtimalı adətən dövrün sonunda həmin səviyyədə olma ehtimalından təxminən iki dəfə yüksəkdir.</dd>
        <dt>Etibarlılıq</dt>
        <dd>Aralığın eni və portfel üzrə nəticələr adətən yüksək, ayrı səhmlər orta, ekstremal hallar (99%) orta-aşağı, median (istiqamət) aşağı etibarlılığa malikdir.</dd>
      </dl>
    </section>
  );
}
