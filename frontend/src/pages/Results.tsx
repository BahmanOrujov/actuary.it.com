import type { EChartsOption } from "echarts";
import { Fragment, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Insights, Kri, MemoItem, Rag, RunResult, RunView } from "../api";
import { ReliabilityBadge } from "../components/Badges";
import { axisStyle, baseOption, ChartCard, Palette } from "../components/Chart";
import {
  Correlation, Distribution, Drawdown, FanChart, Glossary, Kpi, PnlSection, RiskContribution, signClass, StocksSection,
  Stress, TrustPanel, Unit,
} from "../components/ResultSections";
import { dateAz, frequency, money, pct, price, prob } from "../format";
import { Grid, maxLevel, probBelow, quantile, varCvar } from "../quantiles";
import { NoResults, usePortfolio } from "./PortfolioLayout";
import { L, LANG } from "../lang";

/** Decimal comma in Azerbaijani, point in English. */
const dec = (s: string) => (LANG === "az" ? s.replace(".", ",") : s);

// ---------------------------------------------------------------- shared

/** A confidence level as people write it: 0.95 -> "95%", 0.975 -> "97,5%". */
const levelPct = (v: number) => `${dec(Number((v * 100).toFixed(2)).toString())}%`;

const ratio = (v: number | null | undefined, digits = 2) =>
  v == null || !isFinite(v) ? "—" : `${v < 0 ? "−" : ""}${dec(Math.abs(v).toFixed(digits))}`;

function fmtKri(k: Kri): string {
  const v = k.value;
  if (v == null || !isFinite(v)) return "—";
  if (k.kind === "pct") return pct(v);
  if (k.kind === "prob") return prob(v);
  if (k.kind === "times") return `${ratio(v)}×`;
  if (k.kind === "days") return v < 0.1 ? L("<0,1 gün", "<0.1 days") : `${ratio(v, 1)} ${L("gün", "days")}`;
  return ratio(v);
}

const TONE_ICON: Record<string, string> = { good: "✓", warn: "⚠", bad: "✕", info: "•" };
const RAG_LABEL: Record<Rag, string> = { green: L("normal", "normal"), amber: L("diqqət", "watch"), red: L("kritik", "critical"), none: L("məlumat", "info") };
const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, green: 2, none: 3 };

function Memo({ eyebrow, title, items, children }: { eyebrow: string; title: string; items: MemoItem[]; children?: ReactNode }) {
  return (
    <section className="card memo" id="summary">
      <div className="eyebrow">{eyebrow}</div>
      <h2 style={{ fontSize: 20, margin: "4px 0 12px" }}>{title}</h2>
      <ul>
        {items.map((m, i) => (
          <li key={i} className={`tone-${m.tone}`}>
            <span className="ic" aria-hidden="true">{TONE_ICON[m.tone]}</span>
            <span>{m.text}</span>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

function RagChip({ status }: { status: Rag }) {
  return <span className={`rag ${status}`}><span className="dot" aria-hidden="true" /> {RAG_LABEL[status]}</span>;
}

function useResult(): { run: RunView; res: RunResult; ins: Insights | undefined } | { empty: JSX.Element } {
  const { run, runLoaded } = usePortfolio();
  const res = run?.status === "done" ? run.result : undefined;
  if (!run || !res) return { empty: <NoResults run={run} runLoaded={runLoaded} /> };
  // runs computed before the CIO/CRO views existed still show every other section
  return { run, res, ins: res.insights };
}

function OlderRun() {
  return (
    <div className="banner info">
      <span className="ic">ℹ</span>
      {L("Bu nəticə əvvəlki versiyada hesablanıb: brifinq, göstəricilər və yeni bölmələr yoxdur. Onları görmək üçün yuxarıdakı Generate düyməsini basın (adətən 30–60 saniyə).",
        "This result was computed by an earlier version: the briefing, measures and new sections are missing. Press Generate above to see them (usually 30–60 seconds).")}
    </div>
  );
}

/** The four numbers a reader needs first, large, before any text. */
function Hero({ items }: {
  items: { label: string; value: string; sub?: string; tone?: "pos" | "neg" | "warn"; subTone?: "pos" | "neg" }[];
}) {
  return (
    <div className="hero-grid" id="summary">
      {items.map((it) => (
        <div key={it.label} className={`hero-tile ${it.tone ?? ""}`}>
          <div className="hero-label">{it.label}</div>
          <div className={`hero-value${it.value.length > 12 ? " long" : ""}`}>{it.value}</div>
          {it.sub && <div className={`hero-sub ${it.subTone ?? ""}`}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Secondary metrics in named groups; collapsed by default so the page opens with the essentials. */
function KpiGroups({ groups }: { groups: { title: string; hint: string; items: ReactNode[] }[] }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("pa_kpi_open") === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem("pa_kpi_open", o ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !o;
    });
  };
  const n = groups.reduce((k, g) => k + g.items.length, 0);
  return (
    <section className="card kpi-groups-card">
      <button className="expander" onClick={toggle} aria-expanded={open}>
        <span>
          <b>{L("Ətraflı göstəricilər", "Detailed measures")}</b>
          <span className="muted"> · {n} {L("göstərici", "measures")}: {groups.map((g) => g.title.toLocaleLowerCase(LANG)).join(", ")}</span>
        </span>
        <span className="chev" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && groups.map((g) => (
        <div key={g.title} className="kpi-sec">
          <div className="kpi-sec-head"><h3>{g.title}</h3><span className="muted small">{g.hint}</span></div>
          <div className="kpi-row">{g.items}</div>
        </div>
      ))}
    </section>
  );
}

/** A number field that accepts "97,5" or "97.5", keeps what the user types and reports only valid values
 *  (clamped to [min, max]) — the user can try any value without a re-run. */
function NumField({ label, value, onChange, min, max, step = 0.5, suffix, hint, list }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
  suffix?: string; hint?: string; list?: number[];
}) {
  const [text, setText] = useState(dec(String(value)));
  useEffect(() => setText(dec(String(value))), [value]);
  const id = `dl-${label.replace(/\W+/g, "")}`;
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", ".").replace(/[^\d.\-]/g, ""));
    if (raw.trim() === "" || !isFinite(v)) return;
    onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <label className="numfield">
      {label}
      <span className="numwrap">
        <input inputMode="decimal" value={text} list={list ? id : undefined}
          onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
          onBlur={() => setText(dec(String(value)))}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.min(max, Math.max(min, Math.round((value + (e.key === "ArrowUp" ? step : -step)) * 1000) / 1000)));
            }
          }} />
        {suffix && <span className="unit">{suffix}</span>}
      </span>
      {list && <datalist id={id}>{list.map((x) => <option key={x} value={dec(String(x))} />)}</datalist>}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Toolbar({ res, cp, setCp, unit, setUnit, level, setLevel, levelMax, asset, setAsset }: {
  res: RunResult; cp: number; setCp: (n: number) => void; unit: Unit; setUnit: (u: Unit) => void;
  level?: number; setLevel?: (l: number) => void; levelMax?: number; asset?: string; setAsset?: (s: string) => void;
}) {
  return (
    <div className="toolbar" role="group" aria-label={L("Filtrlər", "Filters")}>
      <div className="wide small muted">
        <div><b style={{ color: "var(--fg)" }}>{L("Məlumat tarixi:", "Data as of:")}</b> {dateAz(res.as_of)}</div>
        <div><b style={{ color: "var(--fg)" }}>{L("Dövrün sonu:", "Period end:")}</b> {dateAz(res.horizon_end)} ({res.horizon_days} {L("ticarət günü", "trading days")}) · {res.base_currency}</div>
      </div>
      <label>
        {L("Aralıq tarix", "Checkpoint date")}
        <select value={cp} onChange={(e) => setCp(Number(e.target.value))}>
          {res.checkpoint_dates.map((d, i) => <option key={d} value={i}>{dateAz(d)}</option>)}
        </select>
      </label>
      {level != null && setLevel && (levelMax != null ? (
        <NumField label={L("Güvən səviyyəsi (VaR/CVaR)", "Confidence level (VaR/CVaR)")} value={Math.round(level * 1000) / 10} suffix="%"
          min={50} max={levelMax * 100} step={0.5} list={[90, 95, 97.5, 99].filter((x) => x <= levelMax * 100)}
          onChange={(v) => setLevel(v / 100)}
          hint={levelMax < 0.99 ? L(`model yoxlamadan keçmədiyi üçün maksimum ${pct(levelMax)}`, `at most ${pct(levelMax)} because the model failed a check`) : L("istənilən dəyər: 90, 97,5…", "any value: 90, 97.5…")} />
      ) : (
        <label>
          {L("VaR səviyyəsi", "VaR level")}
          <select value={String(level)} onChange={(e) => setLevel(Number(e.target.value))}>
            <option value="0.95">95%</option>
            <option value="0.99" disabled={!res.risk["0.99"]}>99%{!res.risk["0.99"] ? L(" (gizlədilib)", " (hidden)") : ""}</option>
          </select>
        </label>
      ))}
      <div>
        <div className="small muted" style={{ marginBottom: 4, fontWeight: 500 }}>{L("Göstərmə", "Show as")}</div>
        <div className="toggle" role="group" aria-label={L("Vahid", "Unit")}>
          <button aria-pressed={unit === "money"} onClick={() => setUnit("money")}>{L("Məbləğ", "Amount")}</button>
          <button aria-pressed={unit === "pct"} onClick={() => setUnit("pct")}>%</button>
        </div>
      </div>
      {asset !== undefined && setAsset && (
        <label className="wide">
          {L("Səhm", "Stock")}
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="__portfolio">{L("Bütün portfel", "Whole portfolio")}</option>
            {res.assets.map((a) => <option key={a.symbol} value={a.symbol}>{a.investing_symbol} — {a.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function SectionNav({ items }: { items: [string, string][] }) {
  return (
    <nav className="section-nav" aria-label={L("Bölmələr", "Sections")}>
      {items.map(([id, label]) => (
        <a key={id} href={`#${id}`} onClick={(e) => {
          e.preventDefault();
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}>{label}</a>
      ))}
    </nav>
  );
}

function useCheckpoint(res: RunResult | undefined, runId: number | undefined) {
  const [cp, setCp] = useState(0);
  const n = res?.checkpoints.length ?? 0;
  useEffect(() => {
    if (n) setCp(n - 1);
  }, [runId, n]);
  return [cp, setCp] as const;
}

function Checkpoints({ res, cp, unit }: { res: RunResult; cp: number; unit: Unit }) {
  const ccy = res.base_currency;
  const fmtV = (v: number) => (unit === "money" ? money(v, ccy) : pct(v / res.V0 - 1, { sign: true }));
  const fmtPnl = (v: number) => (unit === "money" ? money(v, ccy, { sign: true }) : pct(v / res.cost_total, { sign: true }));
  return (
    <section className="card" id="checkpoints">
      <div className="card-head">
        <div>
          <h2>{L("Aralıq tarixlər", "Checkpoints")}</h2>
          <div className="sub">{L("Hər ayın sonunda vəziyyət. Seçilmiş tarix vurğulanıb; ehtimallar maya dəyərinə və bugünkü dəyərə nisbətəndir.", "The position at each month end. The selected date is highlighted; probabilities are against cost and today's value.")}</div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{L("Tarix", "Date")}</th><th className="num">{L("Median", "Median")}</th><th className="num">{L("50% aralıq", "50% range")}</th><th className="num">{L("90% aralıq", "90% range")}</th>
              <th className="num">{L("M/z (median)", "P/L (median)")}</th><th className="num">{L("Mənfəətdə olma", "In profit")}</th>
              <th className="num">{L("5%+ itki", "5%+ loss")}</th><th className="num">{L("10%+ itki", "10%+ loss")}</th><th className="num">{L("20%+ itki", "20%+ loss")}</th>
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
                {["0.05", "0.1", "0.2"].map((k) => <td className="num" key={k}>{prob(c.prob_loss_over[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- investment (CIO)

const CLASS_LABEL: Record<string, [string, string]> = {
  efficient: ["ok", L("səmərəli", "efficient")], balanced: ["checking", L("balanslı", "balanced")], costly: ["err", L("baha risk", "costly risk")], hedge: ["ok", L("sığorta", "hedge")],
};

function EfficiencyMap({ ins }: { ins: Insights }) {
  const rows = ins.investment.positions.filter((p) => p.return_share != null);
  const max = Math.max(0.05, ...rows.map((r) => Math.max(r.risk_share, r.return_share ?? 0))) * 1.12;
  // a hedge has a negative risk share (it lowers the portfolio's tail loss): keep it on the map
  const minX = Math.min(0, ...rows.map((r) => r.risk_share)) * 1.12;
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 64, right: 24, top: 20, bottom: 52 },
    xAxis: { type: "value", min: minX, max, ...axisStyle(p), name: L("riskin payı (CVaR 95%)", "share of risk (CVaR 95%)"), nameLocation: "middle", nameGap: 30,
      axisLabel: { color: p.muted, formatter: (v: number) => pct(v), showMinLabel: false, showMaxLabel: false } },
    yAxis: { type: "value", min: 0, max, ...axisStyle(p), name: L("gözlənilən gəlirin payı", "share of expected return"), nameLocation: "middle", nameGap: 46,
      axisLabel: { color: p.muted, formatter: (v: number) => pct(v), showMaxLabel: false } },
    tooltip: { ...baseOption(p).tooltip, trigger: "item", formatter: (x: unknown) => {
      const r = rows[(x as { dataIndex: number }).dataIndex];
      return `<b>${r.symbol}</b> ${r.name}<br/>${L("Çəki", "Weight")} ${pct(r.weight)}<br/>${L("Riskin payı", "Share of risk")} ${pct(r.risk_share)}<br/>${L("Gəlirin payı", "Share of return")} ${pct(r.return_share)}<br/>${L("Səmərəlilik", "Efficiency")} ${ratio(r.efficiency)}`;
    } },
    series: [{
      type: "scatter",
      data: rows.map((r) => ({
        value: [r.risk_share, r.return_share as number],
        symbolSize: 10 + Math.sqrt(r.weight) * 46,
        itemStyle: { color: r.class === "costly" ? p.neg : r.class === "efficient" || r.class === "hedge" ? p.pos : p.neutral, opacity: 0.85 },
        label: { show: true, formatter: r.symbol, position: "right", color: p.fg, fontSize: 12 },
      })),
      markLine: { silent: true, symbol: "none", lineStyle: { color: p.muted, type: "dashed" as const },
        label: { formatter: L("ədalətli bölgü", "fair split"), color: p.muted, fontSize: 12, position: "insideEndTop" as const },
        data: [[{ coord: [0, 0] }, { coord: [max, max] }]] },
    }],
  });
  return (
    <ChartCard
      id="efficiency"
      title={L("Risk-gəlir xəritəsi: hansı mövqe riskini “qazanır”?", "Risk-return map: which position “earns” its risk?")}
      subtitle={L("Hər dairə bir mövqedir (ölçüsü — çəkisi). Xəttin üstündəkilər riskindən çox gəlir payı verir (səmərəli, göy), altındakılar portfelə gəlirindən baha risk gətirir (vermilion). Sıfırdan solda olanlar portfelin pis ssenari itkisini azaldır (sığorta).",
        "Each circle is a position (size — its weight). Those above the line give a larger share of return than of risk (efficient, blue); those below bring the portfolio risk that costs more than their return (vermilion). Those left of zero reduce the portfolio's bad-case loss (hedge).")}
      build={build}
      deps={[ins]}
      ariaLabel={L("Mövqelərin risk payı və gəlir payı səpələnmə qrafiki", "Scatter chart of the positions' share of risk and share of return")}
      table={
        <table>
          <thead><tr><th>{L("Səhm", "Stock")}</th><th className="num">{L("Çəki", "Weight")}</th><th className="num">{L("Riskin payı", "Share of risk")}</th><th className="num">{L("Gəlirin payı", "Share of return")}</th><th className="num">{L("Səmərəlilik", "Efficiency")}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.symbol}><td>{r.symbol}</td><td className="num">{pct(r.weight)}</td><td className="num">{pct(r.risk_share)}</td>
              <td className="num">{pct(r.return_share)}</td><td className="num">{ratio(r.efficiency)}</td></tr>
          ))}</tbody>
        </table>
      }
    />
  );
}

function RiskSource({ ins }: { ins: Insights }) {
  const m = ins.investment.metrics;
  const rows = [...ins.investment.positions].sort((a, b) => b.specific_risk_share - a.specific_risk_share);
  return (
    <section className="card" id="source">
      <h2>{L("Riskin mənbəyi: mükafatlı və mükafatsız", "Where the risk comes from: rewarded and unrewarded")}</h2>
      <p className="small muted">
        {L("Bazar riskini daşıdığınız üçün bazar gəlir “ödəyir”. Şirkətə xas risk isə mükafatlandırılmır — onu diversifikasiya ilə azaltmaq pulsuzdur.",
          "The market “pays” a return for carrying market risk. Company-specific risk is not rewarded — reducing it through diversification is free.")}
      </p>
      <div className="stack" role="img" aria-label={L(`Bazar riski ${pct(m.systematic_share)}, şirkətə xas risk ${pct(m.specific_share)}`, `Market risk ${pct(m.systematic_share)}, company-specific risk ${pct(m.specific_share)}`)}>
        <div className="sys" style={{ width: `${m.systematic_share * 100}%` }}>{L("bazar", "market")} {pct(m.systematic_share)}</div>
        <div className="spec" style={{ width: `${m.specific_share * 100}%` }}>{L("şirkətə xas", "company-specific")} {pct(m.specific_share)}</div>
      </div>
      <table className="small" style={{ marginTop: 12 }}>
        <thead><tr><th>{L("Səhm", "Stock")}</th><th className="num">{L("Bazar həssaslığı (β)", "Market sensitivity (β)")}</th><th>{L("Şirkətə xas pay", "Company-specific share")}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol}>
              <td>{r.symbol}</td>
              <td className="num">{ratio(r.market_sensitivity)}</td>
              <td style={{ minWidth: 140 }}>
                <div className="hbar"><div style={{ width: `${r.specific_risk_share * 100}%` }} /><span>{pct(r.specific_risk_share)}</span></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Exposure({ ins }: { ins: Insights }) {
  const { currency, exchange } = ins.investment.exposure;
  const block = (title: string, rows: { key: string; weight: number }[]) => (
    <div>
      <h3>{title}</h3>
      {rows.map((r) => (
        <div key={r.key} className="hbar-row">
          <span>{r.key}</span>
          <div className="hbar"><div style={{ width: `${r.weight * 100}%` }} /></div>
          <span className="num">{pct(r.weight)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <section className="card" id="exposure">
      <h2>{L("Ekspozisiya", "Exposure")}</h2>
      <p className="small muted">{L("Pulunuz harada işləyir. Əsas valyutadan fərqli valyutalar əlavə məzənnə riski daşıyır (modelə daxildir).", "Where your money works. Currencies other than the base currency carry extra exchange-rate risk (included in the model).")}</p>
      <div className="grid" style={{ gap: 18 }}>
        {block(L("Valyuta", "Currency"), currency)}
        {block(L("Birja", "Exchange"), exchange)}
      </div>
    </section>
  );
}

function Holdings({ res, ins }: { res: RunResult; ins: Insights }) {
  const ccy = res.base_currency;
  const rows = [...ins.investment.positions].sort((a, b) => b.weight - a.weight);
  return (
    <section className="card" id="holdings">
      <div className="card-head">
        <div>
          <h2>{L("Mövqelərin skorkartı", "Position scorecard")}</h2>
          <div className="sub">{L("Hər mövqe nə qazandırır, nə qədər risk gətirir və bu bölgü ədalətlidirmi.", "What each position earns, how much risk it brings and whether that split is fair.")}</div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{L("Səhm", "Stock")}</th><th className="num">{L("Çəki", "Weight")}</th><th className="num">{L("Cari m/z", "Current P/L")}</th><th className="num">{L("Gözlənilən gəlir", "Expected return")}</th>
              <th className="num">{L("Qalxma ehtimalı", "Probability up")}</th><th className="num">{L("90% aralıq", "90% range")}</th><th className="num">{L("Gəlir payı", "Return share")}</th>
              <th className="num">{L("Risk payı", "Risk share")}</th><th>{L("Qiymət", "Rating")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = res.assets.find((x) => x.investing_symbol === r.symbol);
              const pos = res.current.positions.find((x) => x.investing_symbol === r.symbol);
              const [cls, label] = CLASS_LABEL[r.class];
              return (
                <tr key={r.symbol}>
                  <td><span className="ticker">{r.symbol}</span><div className="small muted">{r.name}</div></td>
                  <td className="num">{pct(r.weight)}</td>
                  <td className={`num ${signClass(pos?.unrealized ?? 0)}`}>{pos ? money(pos.unrealized, ccy, { sign: true }) : "—"}</td>
                  <td className="num">{pct(r.expected_return, { sign: true })}</td>
                  <td className="num">{a ? prob(a.prob_up) : "—"}</td>
                  <td className="num">{a ? `${pct(a.end.p05 / a.price0 - 1, { sign: true })} … ${pct(a.end.p95 / a.price0 - 1, { sign: true })}` : "—"}</td>
                  <td className="num">{pct(r.return_share)}</td>
                  <td className="num">{pct(r.risk_share)}</td>
                  <td><span className={`badge ${cls}`}>{label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TargetCalc({ res, grid }: { res: RunResult; grid: Grid }) {
  const ccy = res.base_currency;
  const [gainPct, setGainPct] = useState(10);
  const [gainMoney, setGainMoney] = useState(() => Math.round(res.V0 * 0.05));
  const [band, setBand] = useState(80);
  const above = (x: number) => {
    const b = probBelow(grid, x);
    if (!b) return "—";
    if (b.bound === "lt") return dec(">99.9%");
    if (b.bound === "gt") return dec("<0.1%");
    return prob(1 - b.p);
  };
  const lo = quantile(grid, (1 - band / 100) / 2);
  const hi = quantile(grid, (1 + band / 100) / 2);
  return (
    <section className="card" id="calc">
      <div className="card-head">
        <div>
          <h2>{L("Hədəf kalkulyatoru", "Target calculator")}</h2>
          <div className="sub">{L("Öz hədəfinizi yazın: 3 ayın sonunda ona çatma ehtimalı eyni ssenarilərdən dərhal hesablanır.", "Enter your own target: the probability of reaching it after 3 months is computed at once from the same scenarios.")}</div>
        </div>
      </div>
      <div className="calc-grid">
        <div className="calc">
          <NumField label={L("Gəlir hədəfi", "Return target")} value={gainPct} onChange={setGainPct} min={-50} max={100} step={1} suffix="%" list={[0, 5, 10, 20]} />
          <div className="calc-out"><b>{above(gainPct / 100)}</b><span>{L(`ehtimalla portfel ${pct(gainPct / 100, { sign: true })} və ya daha çox qazanır`, `probability that the portfolio gains ${pct(gainPct / 100, { sign: true })} or more`)}{" "}
            ({money((gainPct / 100) * res.V0, ccy, { sign: true })})</span></div>
        </div>
        <div className="calc">
          <NumField label={`${L("Qazanc hədəfi", "Gain target")} (${ccy})`} value={gainMoney} onChange={setGainMoney} min={-Math.round(res.V0)} max={Math.round(res.V0)} step={100} />
          <div className="calc-out"><b>{above(gainMoney / res.V0)}</b><span>{L(`ehtimalla qazanc ${money(gainMoney, ccy)}-ı keçir`, `probability that the gain exceeds ${money(gainMoney, ccy)}`)}</span></div>
        </div>
        <div className="calc">
          <NumField label={L("Aralığın etibarlılığı", "Range confidence")} value={band} onChange={setBand} min={10} max={98} step={5} suffix="%" list={[50, 80, 90, 95]} />
          <div className="calc-out">
            <b>{lo != null && hi != null ? `${money(res.V0 * (1 + lo), ccy)} – ${money(res.V0 * (1 + hi), ccy)}` : "—"}</b>
            <span>{L(`ssenarilərin ${band}%-i bu aralıqdadır`, `${band}% of the scenarios fall in this range`)} ({lo != null && hi != null ? `${pct(lo, { sign: true })} … ${pct(hi, { sign: true })}` : ""})</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** P&L by purchase lot: what each buy has earned so far and what it may earn by the horizon. */
function LotsSection({ res }: { res: RunResult }) {
  const ccy = res.base_currency;
  const rows = res.current.positions.filter((p) => p.lots && p.lots.length);
  if (!rows.length) return null;
  const many = rows.some((p) => (p.lots?.length ?? 0) > 1);
  return (
    <section className="card" id="lots">
      <div className="card-head">
        <div>
          <h2>{L("Alış tarixinə görə mənfəət/zərər", "Profit/loss by purchase date")}</h2>
          <div className="sub">
            {L(`Hər alış ayrıca: bu günə qədər nə qazandırıb və ${dateAz(res.horizon_end)} tarixinə nə gözlənilir.`, `Each purchase separately: what it has earned so far and what is expected by ${dateAz(res.horizon_end)}.`)}
            {many ? L(" Satışlar FIFO ilə ən köhnə alışdan çıxılıb.", " Sales are taken from the oldest purchase first (FIFO).") : ""}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="lots">
          <thead>
            <tr>
              <th>{L("Səhm / alış tarixi", "Stock / purchase date")}</th><th className="num">{L("Say", "Qty")}</th><th className="num">{L("Alış qiyməti", "Purchase price")}</th>
              <th className="num">{L("Maya → cari dəyər", "Cost → current value")}</th><th className="num">{L("Cari m/z", "Current P/L")}</th><th className="num">{L("Saxlama / illik", "Held / annual")}</th>
              <th className="num">{L("Təxmini m/z", "Est. P/L")}</th><th className="num">{L("90% aralıq", "90% range")}</th><th className="num">{L("Mənfəət ehtimalı", "Profit probability")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Fragment key={p.symbol}>
                <tr className="lot-group">
                  <td colSpan={9}><span className="ticker">{p.investing_symbol}</span> <span className="muted small">{p.name}</span></td>
                </tr>
                {p.lots!.map((l) => (
                  <tr key={`${p.symbol}-${l.trade_date}-${l.quantity}`}>
                    <td className="lot-date">{dateAz(l.trade_date)}</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{price(l.unit_cost_local, p.currency)}</td>
                    <td className="num">{money(l.cost_base, ccy)}<div className="small muted">→ {money(l.market_value_base, ccy)}</div></td>
                    <td className={`num ${signClass(l.unrealized)}`}>
                      {money(l.unrealized, ccy, { sign: true })}<div className="small">{pct(l.unrealized_pct, { sign: true })}</div>
                    </td>
                    <td className="num">{holding(l.holding_days)}
                      <div className={`small ${l.annualized_return != null ? signClass(l.annualized_return) : "muted"}`}>
                        {l.annualized_return != null ? `${pct(l.annualized_return, { sign: true })} ${L("illik", "annual")}` : L("illik — qısa müddət", "annual — too short")}
                      </div>
                    </td>
                    {l.forecast ? (
                      <>
                        <td className={`num ${signClass(l.forecast.median)}`}>{money(l.forecast.median, ccy, { sign: true })}</td>
                        <td className="num">{money(l.forecast.p05, ccy, { sign: true })} …<div>{money(l.forecast.p95, ccy, { sign: true })}</div></td>
                        <td className="num">{prob(l.forecast.prob_profit)}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="muted small">{L("yenidən Generate basın", "press Generate again")}</td>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        {L("Təxmini m/z — alışın öz maya dəyərinə nisbətən dövrün sonundakı mənfəət/zərər. İllik gəlir yalnız kifayət qədər uzun saxlanmış alışlar üçün göstərilir. Maya dəyəri keçmişdə ödənilib: satış qərarı onun əsasında yox, gələcək risk və gəlirə görə verilməlidir.",
          "Est. P/L — profit/loss at the period end against that purchase's own cost. Annual return is shown only for purchases held long enough. The cost was paid in the past: a decision to sell should rest on future risk and return, not on it.")}
      </p>
    </section>
  );
}

function holding(days: number): string {
  if (days < 31) return `${days} ${L("gün", "days")}`;
  if (days < 365) return `${Math.round(days / 30.44)} ${L("ay", "mo")}`;
  const y = days / 365.25;
  return `${dec(y.toFixed(1))} ${L("il", "yr")}`;
}

export function InvestmentView() {
  const r = useResult();
  const [cp, setCp] = useCheckpoint("res" in r ? r.res : undefined, "run" in r ? r.run.id : undefined);
  const [unit, setUnit] = useState<Unit>("money");
  const [asset, setAsset] = useState("__portfolio");
  const [showPaths, setShowPaths] = useState(true);
  if ("empty" in r) return r.empty;
  const { run, res, ins } = r;
  const m = ins?.investment.metrics;
  const ccy = res.base_currency;

  return (
    <>
      {res.warnings.map((w) => <div key={w} className="banner warn"><span className="ic">⚠</span> {w}</div>)}
      {!!res.planned_sells?.length && (
        <div className="banner info" role="status">
          <span className="ic">📅</span> {L("Satış planı nəzərə alınıb — bu səhmlər həmin gün satılır, pulu nağd qalır:", "Sale plans are included — these stocks are sold on that day and the money stays as cash:")}{" "}
          {res.planned_sells.map((s) => `${s.investing_symbol} ${dateAz(s.sell_on)}${s.overdue ? L(" (vaxtı keçib — ilk ticarət günü)", " (overdue — first trading day)") : ""}, ${L("təxmini", "about")} ${money(s.proceeds_median, res.base_currency)}`).join(" · ")}
        </div>
      )}

      <Hero items={[
        { label: L("Portfelin dəyəri", "Portfolio value"), value: money(res.V0, ccy),
          sub: `${money(res.current.total.unrealized, ccy, { sign: true })} (${pct(res.current.total.unrealized_pct, { sign: true })}) ${L("cari mənfəət/zərər", "current profit/loss")}`,
          subTone: res.current.total.unrealized >= 0 ? "pos" : "neg" },
        { label: `${L("Gözlənilən gəlir", "Expected return")} · ${dateAz(res.horizon_end)}`, value: m ? pct(m.expected_return, { sign: true }) : money(res.pnl_end.median, ccy, { sign: true }),
          sub: m ? `${money(m.expected_money, ccy, { sign: true })} — ${L("bazar riskinin mükafatı", "reward for market risk")}` : L("mənfəət/zərərin medianı", "median profit/loss") },
        { label: L("10 ssenaridən 9-u bu aralıqda", "9 in 10 scenarios in this range"), value: `${money(res.checkpoints[res.checkpoints.length - 1].p05, ccy)} – ${money(res.checkpoints[res.checkpoints.length - 1].p95, ccy)}`,
          sub: m ? `${pct(m.range90[0], { sign: true })} … ${pct(m.range90[1], { sign: true })}` : L("dövrün sonunda portfelin dəyəri", "portfolio value at the period end") },
        { label: L("Mənfəətdə bitmə ehtimalı", "Probability of ending in profit"), value: prob(res.pnl_end.prob_profit), sub: L("dövrün sonunda maya dəyərindən yuxarı", "above cost at the period end") },
      ]} />

      {!ins || !m ? <OlderRun /> : (<>
      <Memo eyebrow={L("İnvestisiya · CIO brifinqi", "Investment · CIO briefing")} title={L("Bu portfel pulunuzu necə işlədir?", "How does this portfolio put your money to work?")} items={ins.investment.memo}>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          {L("Etibarlılıq", "Reliability")}: <ReliabilityBadge level={run.reliability} /> · {L("riskin ətraflı təhlili və model yoxlaması", "the detailed risk analysis and model check are in the")}{" "}
          <Link to="../risk" relative="path">Risk</Link> {L("bölməsindədir.", "section.")}
        </p>
      </Memo>

      <KpiGroups groups={[
        { title: L("Gəlir potensialı", "Return potential"), hint: L("nə qədər qazana bilərəm", "how much could I earn"), items: [
          <Kpi key="beat" label={L("Depozitdən çox qazanma ehtimalı", "Probability of beating a deposit")} value={prob(m.prob_beat_rf)} sub={`${L("risksiz gəlir", "risk-free return")} ${pct(m.rf_period)} (${L("3 ay", "3 months")})`} />,
          <Kpi key="best" label={L("Yaxşı ssenari (95%)", "Good scenario (95%)")} value={money(m.best_case_money, ccy, { sign: true })} sub={L(`20 ssenaridən 1-də ${pct(m.best_case, { sign: true })}-dən yaxşı`, `better than ${pct(m.best_case, { sign: true })} in 1 of 20 scenarios`)} />,
          <Kpi key="ud" label={L("Yuxarı / aşağı asimmetriya", "Upside / downside asymmetry")} value={ratio(m.upside_downside)} sub={L(">1: yuxarı potensial aşağı riskdən genişdir", ">1: the upside is wider than the downside")} />,
          <Kpi key="gl" label={L("Qazanc / itki nisbəti (Omega)", "Gain / loss ratio (Omega)")} value={ratio(m.gain_loss_ratio)} sub={L("orta qazanc ÷ orta itki", "average gain ÷ average loss")} />,
        ] },
        { title: L("Risk-gəlir səmərəliliyi", "Risk-return efficiency"), hint: L("riskə görə nə qədər ödənilir", "how much the risk pays"), items: [
          <Kpi key="sh" label={L("Sharpe (illik)", "Sharpe (annual)")} value={ratio(m.sharpe)} sub={`Sortino ${ratio(m.sortino)} · ${L("volatillik", "volatility")} ${pct(m.vol_annual)}`} />,
          <Kpi key="rc" label={L("Gəlir / CVaR 95%", "Return / CVaR 95%")} value={ratio(m.return_to_cvar)} sub={L("pis ssenari itkisinin hər vahidinə gəlir", "return per unit of bad-case loss")} />,
          <Kpi key="tr" label={L("Treynor (illik)", "Treynor (annual)")} value={ratio(m.treynor)} sub={L("bazar riskinin hər vahidinə artıq gəlir", "excess return per unit of market risk")} />,
          <Kpi key="rv" label={L("Rachev nisbəti", "Rachev ratio")} value={ratio(m.rachev)} sub={L("ən yaxşı 5% ÷ ən pis 5% ssenari", "best 5% ÷ worst 5% of scenarios")} />,
          <Kpi key="cm" label={L("Calmar (gözlənilən)", "Calmar (expected)")} value={ratio(m.calmar)} sub={L("gözlənilən gəlir ÷ tipik drawdown", "expected return ÷ typical drawdown")} />,
        ] },
        { title: L("Portfelin quruluşu", "Portfolio structure"), hint: L("pul necə yerləşdirilib", "how the money is placed"), items: [
          <Kpi key="b" label={L("Bazar həssaslığı (β)", "Market sensitivity (β)")} value={ratio(m.market_sensitivity)}
            sub={L(`bazar 10% düşsə, portfel təxminən ${pct(-0.1 * m.market_sensitivity, { sign: true })}`, `if the market falls 10%, the portfolio moves about ${pct(-0.1 * m.market_sensitivity, { sign: true })}`)} />,
          <Kpi key="dv" label={L("Diversifikasiya faydası", "Diversification benefit")} value={pct(m.diversification_benefit)} sub={`${L("effektiv səhm sayı", "effective number of stocks")} ≈ ${ratio(m.effective_n, 1)}`} />,
          <Kpi key="tw" label={L("Ən böyük mövqe", "Largest position")} value={pct(m.top_weight)} sub={L("portfelin payı", "share of the portfolio")} />,
          <Kpi key="dd" label={L("Dividend (alınmış)", "Dividends (received)")} value={money(res.current.total.dividends ?? 0, ccy)} sub={`${L("reallaşmış m/z", "realised P/L")} ${money(res.current.total.realized, ccy, { sign: true })}`} />,
        ] },
      ]} />
      </>)}

      <Toolbar res={res} cp={cp} setCp={setCp} unit={unit} setUnit={setUnit} asset={asset} setAsset={setAsset} />
      <SectionNav items={[["summary", L("Brifinq", "Briefing")], ["calc", L("Kalkulyator", "Calculator")], ["fan", L("Proqnoz", "Forecast")], ["efficiency", L("Risk-gəlir", "Risk-return")], ["source", L("Riskin mənbəyi", "Risk source")],
        ["holdings", L("Mövqelər", "Positions")], ["pnl", L("Mənfəət/zərər", "Profit/loss")], ["lots", L("Alışlar", "Purchases")], ["stocks", L("Səhmlər", "Stocks")], ["glossary", L("Lüğət", "Glossary")]]} />
      {ins?.risk.quantiles && <TargetCalc res={res} grid={ins.risk.quantiles} />}
      <FanChart res={res} unit={unit} asset={asset} showPaths={showPaths} setShowPaths={setShowPaths} />
      {ins && ins.investment.positions.length > 1 && <EfficiencyMap ins={ins} />}
      {ins && (
        <div className="grid two">
          <RiskSource ins={ins} />
          <Exposure ins={ins} />
        </div>
      )}
      {ins && <Holdings res={res} ins={ins} />}
      <Checkpoints res={res} cp={cp} unit={unit} />
      <PnlSection res={res} cp={cp} unit={unit} />
      <LotsSection res={res} />
      <StocksSection res={res} />
      <Glossary res={res}>
        <dt>{L("Gözlənilən gəlir", "Expected return")}</dt>
        <dd>{L("Risksiz faiz + bazar həssaslığı × bazar risk mükafatı (CAPM). Bu, daşıdığınız bazar riskinin “haqqıdır”, səhm seçimi barədə proqnoz deyil.", "Risk-free rate + market sensitivity × market risk premium (CAPM). It is the “fee” for the market risk you carry, not a forecast about stock picking.")}</dd>
        <dt>{L("Sharpe və Sortino", "Sharpe and Sortino")}</dt>
        <dd>{L("Risksiz faizdən artıq gözlənilən gəlirin dəyişkənliyə (Sharpe) və ya yalnız aşağı dəyişkənliyə (Sortino) nisbəti, illik.", "Expected return above the risk-free rate divided by volatility (Sharpe) or by downside volatility only (Sortino), annualised.")}</dd>
        <dt>{L("Gəlir / CVaR", "Return / CVaR")}</dt>
        <dd>{L("Ən pis 5% ssenaridə itkinin hər vahidinə düşən gözlənilən gəlir: quyruq riskinin qiyməti.", "Expected return per unit of loss in the worst 5% of scenarios: the price of tail risk.")}</dd>
        <dt>{L("Səmərəlilik", "Efficiency")}</dt>
        <dd>{L("Mövqenin gözlənilən gəlirdəki payının riskdəki (CVaR) payına nisbəti. 1-dən böyük — riskini “qazanır”; kiçik — portfelə baha başa gəlir.", "A position's share of expected return divided by its share of risk (CVaR). Above 1 — it “earns” its risk; below — it costs the portfolio dearly.")}</dd>
        <dt>{L("Mükafatlı və mükafatsız risk", "Rewarded and unrewarded risk")}</dt>
        <dd>{L("Bazarla birgə hərəkət (sistematik risk) gəlirlə mükafatlandırılır; şirkətə xas dəyişkənlik mükafatlandırılmır və diversifikasiya ilə azalır.", "Moving with the market (systematic risk) is rewarded with return; company-specific volatility is not rewarded and falls with diversification.")}</dd>
      </Glossary>
      <p className="disclaimer">{run.disclaimer}</p>
    </>
  );
}

// ---------------------------------------------------------------- risk (CRO)

function Appetite({ res, ins }: { res: RunResult; ins: Insights }) {
  const m = ins.risk.metrics;
  const k = ins.risk.kri.find((x) => x.key === "limit_use");
  const use = m.limit_use ?? 0;
  const scale = Math.max(1.25, use * 1.1);
  const status = k?.status ?? "none";
  return (
    <section className="card appetite">
      <div className="eyebrow">{L("Risk iştahı", "Risk appetite")}</div>
      <div className="big-num">{pct(use)}</div>
      <div className="muted small">{L("limitdən istifadə (CVaR 95% ÷ limit)", "use of the limit (CVaR 95% ÷ limit)")}</div>
      <div className="limit-bar" role="img" aria-label={`${L("Limitdən istifadə", "Use of the limit")} ${pct(use)}`}>
        <div className={`fill ${status}`} style={{ width: `${Math.min(100, (use / scale) * 100)}%` }} />
        <span className="mark" style={{ left: `${100 / scale}%` }} title="limit" />
      </div>
      <div className="row-actions small" style={{ justifyContent: "space-between" }}>
        <span>CVaR {money(m.cvar95 * res.V0, res.base_currency)} ({pct(m.cvar95)})</span>
        <span>limit {pct(m.limit)}</span>
      </div>
      <div style={{ marginTop: 12 }}><RagChip status={status} /></div>
      <p className="small" style={{ marginTop: 10 }}>
        {m.headroom_money != null && m.headroom_money >= 0
          ? <>{L("Ehtiyat", "Headroom")}: <b>{money(m.headroom_money, res.base_currency)}</b></>
          : <>{L("Aşım", "Excess")}: <b>{money(-(m.headroom_money ?? 0), res.base_currency)}</b></>}
        {m.beyond_limit != null && <> · {L("limitdən çox itki ehtimalı", "probability of losing more than the limit")} <b>{prob(m.beyond_limit)}</b></>}
      </p>
    </section>
  );
}

function KriBoard({ run, ins }: { run: RunView; ins: Insights }) {
  const relStatus: Rag = run.reliability === "high" ? "green" : run.reliability === "medium" ? "amber" : run.reliability === "low" ? "red" : "none";
  const rows: Kri[] = [
    ...ins.risk.kri,
    { key: "model", label: L("Modelin etibarlılığı (keçmiş məlumatda yoxlama)", "Model reliability (checked on past data)"), value: null, kind: "ratio" as const, status: relStatus,
      hint: run.reliability_text },
  ].sort((a, b) => RAG_ORDER[a.status] - RAG_ORDER[b.status]);
  const counts = { red: rows.filter((r) => r.status === "red").length, amber: rows.filter((r) => r.status === "amber").length };
  return (
    <section className="card" id="kri">
      <div className="card-head">
        <div>
          <h2>{L("Əsas risk göstəriciləri (KRI)", "Key risk indicators (KRI)")}</h2>
          <div className="sub">{L("Svetofor: kritik → diqqət → normal. Hədlər admin parametrlərindədir və bütün portfellər üçün eynidir.", "Traffic light: critical → watch → normal. The thresholds are admin settings and the same for every portfolio.")}</div>
        </div>
        <div className="row-actions small">
          <span className="rag red"><span className="dot" aria-hidden="true" /> {counts.red} {L("kritik", "critical")}</span>
          <span className="rag amber"><span className="dot" aria-hidden="true" /> {counts.amber} {L("diqqət", "watch")}</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="kri">
          <thead><tr><th>{L("Göstərici", "Indicator")}</th><th className="num">{L("Dəyər", "Value")}</th><th>Status</th><th>{L("Şərh", "Comment")}</th></tr></thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.key} className={`kri-${k.status}`}>
                <td>{k.label}</td>
                <td className="num"><b>{k.key === "model" ? <ReliabilityBadge level={run.reliability} /> : fmtKri(k)}</b></td>
                <td><RagChip status={k.status} /></td>
                <td className="small muted">{k.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VolRegime({ ins }: { ins: Insights }) {
  const m = ins.risk.metrics;
  const rows = [...ins.risk.assets.map((a) => ({ name: a.symbol, now: a.now, long: a.long })),
    { name: L("Portfel", "Portfolio"), now: m.vol_now, long: m.vol_long }].reverse();
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    legend: { top: 0, textStyle: { color: p.muted } },
    grid: { left: 70, right: 24, top: 30, bottom: 36 },
    yAxis: { type: "category", data: rows.map((r) => r.name), ...axisStyle(p), splitLine: { show: false } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => pct(Number(v)) },
    series: [
      { name: L("Uzunmüddətli norma", "Long-run norm"), type: "scatter", data: rows.map((r) => r.long), symbolSize: 9, itemStyle: { color: p.neutral } },
      { name: L("İndi", "Now"), type: "scatter", data: rows.map((r) => r.now), symbolSize: 11,
        itemStyle: { color: ((x: { dataIndex: number }) => (rows[x.dataIndex].now > rows[x.dataIndex].long ? p.neg : p.pos)) as never } },
      { type: "custom", silent: true, z: 1, data: rows.map((r, i) => [i, r.long, r.now]), encode: { y: 0, x: [1, 2] },
        renderItem: (_params, api) => {
          const y = api.coord([0, api.value(0)])[1];
          return { type: "line", shape: { x1: api.coord([api.value(1), 0])[0], y1: y, x2: api.coord([api.value(2), 0])[0], y2: y },
            style: { stroke: p.neutral, lineWidth: 1.5 } };
        } },
    ],
  });
  return (
    <ChartCard
      id="regime"
      title={L("Volatillik rejimi: indi normadan yüksəkdirmi?", "Volatility regime: is it above normal now?")}
      subtitle={L(`Boz — uzunmüddətli norma, rəngli — bugünkü proqnoz (illik). Vermilion — risk normadan yüksəkdir, göy — aşağı. Portfel: ${ratio(m.vol_regime)}× norma.`,
        `Grey — long-run norm, coloured — today's forecast (annual). Vermilion — risk above normal, blue — below. Portfolio: ${ratio(m.vol_regime)}× the norm.`)}
      build={build}
      deps={[ins]}
      ariaLabel={L("Bugünkü və uzunmüddətli volatillik müqayisəsi", "Today's versus long-run volatility")}
      height={rows.length > 8 ? "tall" : "short"}
      table={
        <table>
          <thead><tr><th>{L("Səhm", "Stock")}</th><th className="num">{L("İndi", "Now")}</th><th className="num">{L("Norma", "Norm")}</th><th className="num">{L("Nisbət", "Ratio")}</th><th className="num">{L("Satış müddəti", "Time to sell")}</th></tr></thead>
          <tbody>
            {ins.risk.assets.map((a) => (
              <tr key={a.symbol}><td>{a.symbol}</td><td className="num">{pct(a.now)}</td><td className="num">{pct(a.long)}</td>
                <td className="num">{ratio(a.ratio)}×</td>
                <td className="num">{a.liquidity_days == null ? "—" : a.liquidity_days < 0.1 ? L("<0,1 gün", "<0.1 days") : `${ratio(a.liquidity_days, 1)} ${L("gün", "days")}`}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

/** VaR/CVaR at a confidence level: from the quantile grid when the run has one, else the run's 95/99 measures. */
function riskAt(res: RunResult, grid: Grid | undefined, level: number): { var: number; cvar: number } | null {
  // the run's own 95/99 measures are exact (all scenarios); the grid interpolates, so use it only in between
  const r = res.risk[String(level)];
  if (r) return { var: r.var_pct, cvar: r.cvar_pct };
  return grid ? varCvar(grid, level) : null;
}

function VarLadder({ res, grid }: { res: RunResult; grid: Grid }) {
  const ccy = res.base_currency;
  const top = maxLevel(grid);
  const levels = [0.8, 0.9, 0.95, 0.975, 0.99, 0.995].filter((l) => l <= top + 1e-9);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{L("Güvən səviyyəsi", "Confidence level")}</th><th className="num">VaR</th><th className="num">{L("VaR, məbləğ", "VaR, amount")}</th><th className="num">CVaR</th>
            <th className="num">{L("CVaR, məbləğ", "CVaR, amount")}</th><th>{L("Tezlik", "Frequency")}</th></tr>
        </thead>
        <tbody>
          {levels.map((l) => {
            const v = riskAt(res, grid, l);
            if (!v) return null;
            return (
              <tr key={l}>
                <td>{levelPct(l)}</td><td className="num">{pct(v.var)}</td><td className="num">{money(v.var * res.V0, ccy)}</td>
                <td className="num">{pct(v.cvar)}</td><td className="num">{money(v.cvar * res.V0, ccy)}</td>
                <td className="small muted">{L(`${frequency(1 - l)} itki VaR-dan çox olur`, `the loss exceeds VaR in ${frequency(1 - l)}`)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RiskCalc({ res, ins, grid }: { res: RunResult; ins: Insights | undefined; grid: Grid }) {
  const ccy = res.base_currency;
  const [lossPct, setLossPct] = useState(10);
  const [lossMoney, setLossMoney] = useState(() => Math.round(res.V0 * 0.1));
  const [shock, setShock] = useState(-20);
  const pL = probBelow(grid, -lossPct / 100);
  const pM = probBelow(grid, -lossMoney / res.V0);
  const fmtP = (x: ReturnType<typeof probBelow>) =>
    !x ? L("göstərilmir", "not shown") : x.bound === "lt" ? dec("<0.1%") : x.bound === "gt" ? dec(">99.9%") : prob(x.p);
  const beta = ins?.investment.metrics.market_sensitivity;
  const positions = ins?.investment.positions ?? [];
  return (
    <section className="card" id="calc">
      <div className="card-head">
        <div>
          <h2>{L("Risk kalkulyatoru", "Risk calculator")}</h2>
          <div className="sub">{L(`Öz rəqəmlərinizi yazın — cavab dərhal eyni ${res.scenarios.toLocaleString("az")} ssenaridən hesablanır, yeni Generate lazım deyil.`, `Enter your own numbers — the answer comes at once from the same ${res.scenarios.toLocaleString("en")} scenarios; no new Generate needed.`)}</div>
        </div>
      </div>
      <div className="calc-grid">
        <div className="calc">
          <NumField label={L("İtki həddi", "Loss threshold")} value={lossPct} onChange={setLossPct} min={0.5} max={80} step={1} suffix="%" list={[5, 10, 15, 20, 30]} />
          <div className="calc-out"><b>{fmtP(pL)}</b><span>{L("ehtimalla 3 ayın sonunda portfel bu qədər və ya daha çox itirir", "probability that the portfolio loses this much or more after 3 months")}{" "}
            ({money((lossPct / 100) * res.V0, ccy)})</span></div>
        </div>
        <div className="calc">
          <NumField label={`${L("İtki həddi", "Loss threshold")} (${ccy})`} value={lossMoney} onChange={setLossMoney} min={1} max={Math.round(res.V0)} step={100} />
          <div className="calc-out"><b>{fmtP(pM)}</b><span>{L(`ehtimalla itki ${money(lossMoney, ccy)}-ı keçir`, `probability that the loss exceeds ${money(lossMoney, ccy)}`)}{" "}
            ({pct(lossMoney / res.V0)} {L("portfelin", "of the portfolio")})</span></div>
        </div>
        {beta != null && (
          <div className="calc">
            <NumField label={L("Bazar şoku (S&P 500 və s.)", "Market shock (S&P 500 etc.)")} value={shock} onChange={setShock} min={-60} max={60} step={5} suffix="%" list={[-30, -20, -10, 10, 20]} />
            <div className="calc-out"><b className={shock * beta < 0 ? "neg" : "pos"}>{pct((shock / 100) * beta, { sign: true })}</b>
              <span>{L("təxmini portfel dəyişikliyi", "estimated portfolio change")} ({money((shock / 100) * beta * res.V0, ccy, { sign: true })}); {L("bazar həssaslığı", "market sensitivity")} {ratio(beta)}</span></div>
          </div>
        )}
      </div>
      {beta != null && positions.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small">{L("Bazar şokunun mövqelərə bölgüsü", "The market shock by position")}</summary>
          <table className="small" style={{ marginTop: 8 }}>
            <thead><tr><th>{L("Səhm", "Stock")}</th><th className="num">{L("Həssaslıq (β)", "Sensitivity (β)")}</th><th className="num">{L("Dəyişiklik", "Change")}</th><th className="num">{L("Məbləğ", "Amount")}</th></tr></thead>
            <tbody>
              {positions.map((p) => {
                const ch = (shock / 100) * p.market_sensitivity;
                return (
                  <tr key={p.symbol}><td>{p.symbol}</td><td className="num">{ratio(p.market_sensitivity)}</td>
                    <td className={`num ${signClass(ch)}`}>{pct(ch, { sign: true })}</td>
                    <td className={`num ${signClass(ch)}`}>{money(ch * p.weight * res.V0, ccy, { sign: true })}</td></tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">{L("Xətti təxmindir: yalnız bazarla birgə hərəkəti nəzərə alır, şirkətə xas xəbərləri yox.", "A linear estimate: it covers only moving with the market, not company-specific news.")}</p>
        </details>
      )}
      <h3 style={{ marginTop: 18 }}>{L("VaR / CVaR nərdivanı", "VaR / CVaR ladder")}</h3>
      <VarLadder res={res} grid={grid} />
    </section>
  );
}

export function RiskView() {
  const r = useResult();
  const [cp, setCp] = useCheckpoint("res" in r ? r.res : undefined, "run" in r ? r.run.id : undefined);
  const [unit, setUnit] = useState<Unit>("money");
  const [level, setLevel] = useState(0.95);
  if ("empty" in r) return r.empty;
  const { run, res, ins } = r;
  const ccy = res.base_currency;
  const grid = ins?.risk.quantiles;
  const top = grid ? maxLevel(grid) : undefined;
  const lv = grid ? Math.min(level, top ?? level) : res.risk[String(level)] ? level : 0.95;
  const risk = riskAt(res, grid, lv) ?? { var: res.risk["0.95"].var_pct, cvar: res.risk["0.95"].cvar_pct };
  const m = ins?.risk.metrics;
  const lvText = levelPct(lv);

  return (
    <>
      {res.warnings.map((w) => <div key={w} className="banner warn"><span className="ic">⚠</span> {w}</div>)}
      {!!res.planned_sells?.length && (
        <div className="banner info" role="status">
          <span className="ic">📅</span> {L("Satış planı nəzərə alınıb — bu səhmlər həmin gün satılır, pulu nağd qalır:", "Sale plans are included — these stocks are sold on that day and the money stays as cash:")}{" "}
          {res.planned_sells.map((s) => `${s.investing_symbol} ${dateAz(s.sell_on)}${s.overdue ? L(" (vaxtı keçib — ilk ticarət günü)", " (overdue — first trading day)") : ""}, ${L("təxmini", "about")} ${money(s.proceeds_median, res.base_currency)}`).join(" · ")}
        </div>
      )}

      <Hero items={[
        { label: `VaR ${lvText} · ${L("3 ay", "3 months")}`, value: money(risk.var * res.V0, ccy),
          sub: `${pct(risk.var)} · ${L(`${frequency(1 - lv)} itki bundan çox olur`, `the loss is larger in ${frequency(1 - lv)}`)}`, tone: "neg" },
        { label: `CVaR ${lvText} · ${L("3 ay", "3 months")}`, value: money(risk.cvar * res.V0, ccy),
          sub: `${pct(risk.cvar)} · ${L(`ən pis ${levelPct(1 - lv)} ssenarinin orta itkisi`, `average loss of the worst ${levelPct(1 - lv)} of scenarios`)}`, tone: "neg" },
        { label: L("Dövr ərzində tipik ən dərin düşmə", "Typical deepest fall during the period"), value: pct(res.drawdown.mdd_percentiles["50"]),
          sub: L(`20 rübdən 1-də ${pct(res.drawdown.mdd_percentiles["5"])}-dən pis`, `worse than ${pct(res.drawdown.mdd_percentiles["5"])} in 1 quarter in 20`) },
        { label: L("3 ayın sonunda itkidə olma", "In loss after 3 months"), value: m ? prob(m.prob_loss) : prob(res.checkpoints[res.checkpoints.length - 1].prob_loss_vs_today),
          sub: L("bugünkü dəyərdən aşağı bitmə ehtimalı", "probability of ending below today's value") },
      ]} />

      {ins ? (
        <div className="cro-top">
          <Appetite res={res} ins={ins} />
          <Memo eyebrow={L("Risk · CRO paneli", "Risk · CRO panel")} title={L("Nə səhv gedə bilər və nə qədər?", "What can go wrong, and by how much?")} items={ins.risk.memo} />
        </div>
      ) : <OlderRun />}

      {m && (
        <KpiGroups groups={[
          { title: L("Dəyişkənlik", "Volatility"), hint: L("qiymət nə qədər tərpənir", "how much the price moves"), items: [
            <Kpi key="v" label={L("Volatillik (illik, indi)", "Volatility (annual, now)")} value={pct(m.vol_now)} sub={`${L("norma", "norm")} ${pct(m.vol_long)} · ${ratio(m.vol_regime)}×`} />,
            <Kpi key="sd" label={L("Aşağı yarımsapma (illik)", "Downside semideviation (annual)")} value={pct(m.semidev_annual)} sub={L("yalnız itkiləri sayan dəyişkənlik", "volatility counting losses only")} />,
            <Kpi key="c" label={L("Orta korrelyasiya", "Average correlation")} value={ratio(m.corr_now)}
              sub={m.corr_pair ? `${L("ən güclü cüt", "strongest pair")} ${m.corr_pair.a}–${m.corr_pair.b} ${ratio(m.corr_pair.value)}` : L("tək mövqe", "single position")} />,
          ] },
          { title: L("Quyruq riski", "Tail risk"), hint: L("nadir, amma ağır hallar", "rare but severe cases"), items: [
            ...(m.worst_case != null ? [<Kpi key="w" label={L("Ən pis ssenari (0,1%)", "Worst scenario (0.1%)")} value={pct(m.worst_case, { sign: true })}
              sub={`${money(m.worst_case * res.V0, ccy, { sign: true })} · ${L("1000 ssenaridən 1-i", "1 in 1000 scenarios")}`} />] : []),
            <Kpi key="sk" label={L("Asimmetriya (skewness)", "Asymmetry (skewness)")} value={ratio(m.skewness)} sub={L("<0: pis sürprizlər yaxşılardan böyükdür", "<0: bad surprises are larger than good ones")} />,
            <Kpi key="ku" label={L("Quyruq qalınlığı (artıq kurtoz)", "Tail thickness (excess kurtosis)")} value={ratio(m.excess_kurtosis)} sub={L(">0: ekstremal hallar normaldan tez-tez", ">0: extremes happen more often than normal")} />,
          ] },
        ]} />
      )}
      {res.hidden_99 && <div className="banner warn"><span className="ic">⚠</span> {L("Model bəzi yoxlamalardan keçmədiyi üçün ekstremal (98%-dən yuxarı) göstəricilər gizlədilib.", "Extreme measures (above 98%) are hidden because the model failed some checks.")}</div>}

      <Toolbar res={res} cp={cp} setCp={setCp} unit={unit} setUnit={setUnit} level={lv} setLevel={setLevel} levelMax={top} />
      <SectionNav items={[["summary", L("Brifinq", "Briefing")], ["calc", L("Kalkulyator", "Calculator")], ["kri", "KRI"], ["dist", L("Quyruq", "Tail")], ["drawdown", "Drawdown"],
        ["regime", L("Rejim", "Regime")], ["contrib", L("Konsentrasiya", "Concentration")], ["stress", "Stress"], ["trust", L("Model riski", "Model risk")], ["glossary", L("Lüğət", "Glossary")]]} />
      {grid && <RiskCalc res={res} ins={ins} grid={grid} />}
      {ins && <KriBoard run={run} ins={ins} />}
      <Distribution res={res} level={String(lv)} risk={risk} />
      <Drawdown res={res} />
      {ins && <VolRegime ins={ins} />}
      {res.assets.length > 1 && <RiskContribution res={res} />}
      {res.correlation && <Correlation res={res} />}
      <Stress res={res} unit={unit} showLimit />
      <TrustPanel run={run} />
      <Glossary res={res}>
        <dt>{L("Risk iştahı və limit", "Risk appetite and limit")}</dt>
        <dd>{L("Limit — 3 ayda ən pis 5% ssenaridə qəbul etdiyiniz orta itki (CVaR 95%). İstifadə 100%-i keçəndə portfel iştahınızdan risklidir.", "The limit is the average loss you accept in the worst 5% of scenarios over 3 months (CVaR 95%). Above 100% use, the portfolio is riskier than your appetite.")}</dd>
        <dt>{L("Güvən səviyyəsini dəyişmək", "Changing the confidence level")}</dt>
        <dd>{L("VaR və CVaR istənilən səviyyədə (məs. 97,5% — Bazel standartı) eyni ssenarilərdən hesablanır. Səviyyə yüksəldikcə rəqəm böyüyür, amma hadisə nadirləşir.", "VaR and CVaR are computed at any level (e.g. 97.5% — the Basel standard) from the same scenarios. A higher level gives a bigger number for a rarer event.")}</dd>
        <dt>{L("KRI və svetofor", "KRI and traffic light")}</dt>
        <dd>{L("Əsas risk göstəriciləri: hər biri sabit hədlərlə müqayisə olunur. “Diqqət” — izləmək, “kritik” — qərar tələb edir.", "Key risk indicators: each is compared with fixed thresholds. “Watch” — keep an eye on it, “critical” — needs a decision.")}</dd>
        <dt>{L("Volatillik rejimi", "Volatility regime")}</dt>
        <dd>{L("Bugünkü proqnoz volatilliyin modelin uzunmüddətli normasına nisbəti. 1-dən böyük — bazar normadan təlatümlüdür.", "Today's forecast volatility divided by the model's long-run norm. Above 1 — the market is more turbulent than normal.")}</dd>
        <dt>{L("Skewness və kurtoz", "Skewness and kurtosis")}</dt>
        <dd>{L("Paylanmanın forması: mənfi skewness — böyük itkilər böyük qazanclardan ehtimallıdır; müsbət artıq kurtoz — ekstremal günlər normal paylanmadan daha tez-tez olur.", "The shape of the distribution: negative skewness — big losses are likelier than big gains; positive excess kurtosis — extreme days happen more often than under a normal distribution.")}</dd>
        <dt>{L("Aşağı yarımsapma", "Downside semideviation")}</dt>
        <dd>{L("Yalnız mənfi nəticələri nəzərə alan dəyişkənlik: “yuxarı” dəyişkənlik risk sayılmır.", "Volatility of negative outcomes only: “upside” volatility is not counted as risk.")}</dd>
      </Glossary>
      <p className="disclaimer">{run.disclaimer}</p>
    </>
  );
}
