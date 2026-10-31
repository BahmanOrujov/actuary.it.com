import type { EChartsOption } from "echarts";
import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Insights, Kri, MemoItem, Rag, RunResult, RunView } from "../api";
import { ReliabilityBadge } from "../components/Badges";
import { axisStyle, baseOption, ChartCard, Palette } from "../components/Chart";
import {
  Correlation, Distribution, Drawdown, FanChart, Glossary, Kpi, PnlSection, RiskContribution, signClass, StocksSection,
  Stress, TrustPanel, Unit,
} from "../components/ResultSections";
import { dateAz, frequency, money, pct, prob } from "../format";
import { Grid, maxLevel, probBelow, quantile, varCvar } from "../quantiles";
import { NoResults, usePortfolio } from "./PortfolioLayout";

// ---------------------------------------------------------------- shared

/** A confidence level as people write it: 0.95 -> "95%", 0.975 -> "97,5%". */
const levelPct = (v: number) => `${Number((v * 100).toFixed(2)).toString().replace(".", ",")}%`;

const ratio = (v: number | null | undefined, digits = 2) =>
  v == null || !isFinite(v) ? "—" : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits).replace(".", ",")}`;

function fmtKri(k: Kri): string {
  const v = k.value;
  if (v == null || !isFinite(v)) return "—";
  if (k.kind === "pct") return pct(v);
  if (k.kind === "prob") return prob(v);
  if (k.kind === "times") return `${ratio(v)}×`;
  if (k.kind === "days") return v < 0.1 ? "<0,1 gün" : `${ratio(v, 1)} gün`;
  return ratio(v);
}

const TONE_ICON: Record<string, string> = { good: "✓", warn: "⚠", bad: "✕", info: "•" };
const RAG_LABEL: Record<Rag, string> = { green: "normal", amber: "diqqət", red: "kritik", none: "məlumat" };
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
      Bu nəticə əvvəlki versiyada hesablanıb: brifinq, göstəricilər və yeni bölmələr yoxdur. Onları görmək üçün yuxarıdakı
      Generate düyməsini basın (adətən 30–60 saniyə).
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
          <b>Ətraflı göstəricilər</b>
          <span className="muted"> · {n} göstərici: {groups.map((g) => g.title.toLocaleLowerCase("az")).join(", ")}</span>
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
  const [text, setText] = useState(String(value).replace(".", ","));
  useEffect(() => setText(String(value).replace(".", ",")), [value]);
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
          onBlur={() => setText(String(value).replace(".", ","))}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.min(max, Math.max(min, Math.round((value + (e.key === "ArrowUp" ? step : -step)) * 1000) / 1000)));
            }
          }} />
        {suffix && <span className="unit">{suffix}</span>}
      </span>
      {list && <datalist id={id}>{list.map((x) => <option key={x} value={String(x).replace(".", ",")} />)}</datalist>}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Toolbar({ res, cp, setCp, unit, setUnit, level, setLevel, levelMax, asset, setAsset }: {
  res: RunResult; cp: number; setCp: (n: number) => void; unit: Unit; setUnit: (u: Unit) => void;
  level?: number; setLevel?: (l: number) => void; levelMax?: number; asset?: string; setAsset?: (s: string) => void;
}) {
  return (
    <div className="toolbar" role="group" aria-label="Filtrlər">
      <div className="wide small muted">
        <div><b style={{ color: "var(--fg)" }}>Məlumat tarixi:</b> {dateAz(res.as_of)}</div>
        <div><b style={{ color: "var(--fg)" }}>Dövrün sonu:</b> {dateAz(res.horizon_end)} ({res.horizon_days} ticarət günü) · {res.base_currency}</div>
      </div>
      <label>
        Aralıq tarix
        <select value={cp} onChange={(e) => setCp(Number(e.target.value))}>
          {res.checkpoint_dates.map((d, i) => <option key={d} value={i}>{dateAz(d)}</option>)}
        </select>
      </label>
      {level != null && setLevel && (levelMax != null ? (
        <NumField label="Güvən səviyyəsi (VaR/CVaR)" value={Math.round(level * 1000) / 10} suffix="%"
          min={50} max={levelMax * 100} step={0.5} list={[90, 95, 97.5, 99].filter((x) => x <= levelMax * 100)}
          onChange={(v) => setLevel(v / 100)}
          hint={levelMax < 0.99 ? `model yoxlamadan keçmədiyi üçün maksimum ${pct(levelMax)}` : "istənilən dəyər: 90, 97,5…"} />
      ) : (
        <label>
          VaR səviyyəsi
          <select value={String(level)} onChange={(e) => setLevel(Number(e.target.value))}>
            <option value="0.95">95%</option>
            <option value="0.99" disabled={!res.risk["0.99"]}>99%{!res.risk["0.99"] ? " (gizlədilib)" : ""}</option>
          </select>
        </label>
      ))}
      <div>
        <div className="small muted" style={{ marginBottom: 4, fontWeight: 500 }}>Göstərmə</div>
        <div className="toggle" role="group" aria-label="Vahid">
          <button aria-pressed={unit === "money"} onClick={() => setUnit("money")}>Məbləğ</button>
          <button aria-pressed={unit === "pct"} onClick={() => setUnit("pct")}>%</button>
        </div>
      </div>
      {asset !== undefined && setAsset && (
        <label className="wide">
          Səhm
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="__portfolio">Bütün portfel</option>
            {res.assets.map((a) => <option key={a.symbol} value={a.symbol}>{a.investing_symbol} — {a.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function SectionNav({ items }: { items: [string, string][] }) {
  return (
    <nav className="section-nav" aria-label="Bölmələr">
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
          <h2>Aralıq tarixlər</h2>
          <div className="sub">Hər ayın sonunda vəziyyət. Seçilmiş tarix vurğulanıb; ehtimallar maya dəyərinə və bugünkü dəyərə nisbətəndir.</div>
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
  efficient: ["ok", "səmərəli"], balanced: ["checking", "balanslı"], costly: ["err", "baha risk"], hedge: ["ok", "sığorta"],
};

function EfficiencyMap({ ins }: { ins: Insights }) {
  const rows = ins.investment.positions.filter((p) => p.return_share != null);
  const max = Math.max(0.05, ...rows.map((r) => Math.max(r.risk_share, r.return_share ?? 0))) * 1.12;
  // a hedge has a negative risk share (it lowers the portfolio's tail loss): keep it on the map
  const minX = Math.min(0, ...rows.map((r) => r.risk_share)) * 1.12;
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    grid: { left: 64, right: 24, top: 20, bottom: 52 },
    xAxis: { type: "value", min: minX, max, ...axisStyle(p), name: "riskin payı (CVaR 95%)", nameLocation: "middle", nameGap: 30,
      axisLabel: { color: p.muted, formatter: (v: number) => pct(v), showMinLabel: false, showMaxLabel: false } },
    yAxis: { type: "value", min: 0, max, ...axisStyle(p), name: "gözlənilən gəlirin payı", nameLocation: "middle", nameGap: 46,
      axisLabel: { color: p.muted, formatter: (v: number) => pct(v), showMaxLabel: false } },
    tooltip: { ...baseOption(p).tooltip, trigger: "item", formatter: (x: unknown) => {
      const r = rows[(x as { dataIndex: number }).dataIndex];
      return `<b>${r.symbol}</b> ${r.name}<br/>Çəki ${pct(r.weight)}<br/>Riskin payı ${pct(r.risk_share)}<br/>Gəlirin payı ${pct(r.return_share)}<br/>Səmərəlilik ${ratio(r.efficiency)}`;
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
        label: { formatter: "ədalətli bölgü", color: p.muted, fontSize: 12, position: "insideEndTop" as const },
        data: [[{ coord: [0, 0] }, { coord: [max, max] }]] },
    }],
  });
  return (
    <ChartCard
      id="efficiency"
      title="Risk-gəlir xəritəsi: hansı mövqe riskini “qazanır”?"
      subtitle="Hər dairə bir mövqedir (ölçüsü — çəkisi). Xəttin üstündəkilər riskindən çox gəlir payı verir (səmərəli, göy), altındakılar portfelə gəlirindən baha risk gətirir (vermilion). Sıfırdan solda olanlar portfelin pis ssenari itkisini azaldır (sığorta)."
      build={build}
      deps={[ins]}
      ariaLabel="Mövqelərin risk payı və gəlir payı səpələnmə qrafiki"
      table={
        <table>
          <thead><tr><th>Səhm</th><th className="num">Çəki</th><th className="num">Riskin payı</th><th className="num">Gəlirin payı</th><th className="num">Səmərəlilik</th></tr></thead>
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
      <h2>Riskin mənbəyi: mükafatlı və mükafatsız</h2>
      <p className="small muted">
        Bazar riskini daşıdığınız üçün bazar gəlir “ödəyir”. Şirkətə xas risk isə mükafatlandırılmır — onu diversifikasiya ilə azaltmaq
        pulsuzdur.
      </p>
      <div className="stack" role="img" aria-label={`Bazar riski ${pct(m.systematic_share)}, şirkətə xas risk ${pct(m.specific_share)}`}>
        <div className="sys" style={{ width: `${m.systematic_share * 100}%` }}>bazar {pct(m.systematic_share)}</div>
        <div className="spec" style={{ width: `${m.specific_share * 100}%` }}>şirkətə xas {pct(m.specific_share)}</div>
      </div>
      <table className="small" style={{ marginTop: 12 }}>
        <thead><tr><th>Səhm</th><th className="num">Bazar həssaslığı (β)</th><th>Şirkətə xas pay</th></tr></thead>
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
      <h2>Ekspozisiya</h2>
      <p className="small muted">Pulunuz harada işləyir. Əsas valyutadan fərqli valyutalar əlavə məzənnə riski daşıyır (modelə daxildir).</p>
      <div className="grid" style={{ gap: 18 }}>
        {block("Valyuta", currency)}
        {block("Birja", exchange)}
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
          <h2>Mövqelərin skorkartı</h2>
          <div className="sub">Hər mövqe nə qazandırır, nə qədər risk gətirir və bu bölgü ədalətlidirmi.</div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Səhm</th><th className="num">Çəki</th><th className="num">Cari m/z</th><th className="num">Gözlənilən gəlir</th>
              <th className="num">Qalxma ehtimalı</th><th className="num">90% aralıq</th><th className="num">Gəlir payı</th>
              <th className="num">Risk payı</th><th>Qiymət</th>
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
    if (b.bound === "lt") return ">99,9%";
    if (b.bound === "gt") return "<0,1%";
    return prob(1 - b.p);
  };
  const lo = quantile(grid, (1 - band / 100) / 2);
  const hi = quantile(grid, (1 + band / 100) / 2);
  return (
    <section className="card" id="calc">
      <div className="card-head">
        <div>
          <h2>Hədəf kalkulyatoru</h2>
          <div className="sub">Öz hədəfinizi yazın: 3 ayın sonunda ona çatma ehtimalı eyni ssenarilərdən dərhal hesablanır.</div>
        </div>
      </div>
      <div className="calc-grid">
        <div className="calc">
          <NumField label="Gəlir hədəfi" value={gainPct} onChange={setGainPct} min={-50} max={100} step={1} suffix="%" list={[0, 5, 10, 20]} />
          <div className="calc-out"><b>{above(gainPct / 100)}</b><span>ehtimalla portfel {pct(gainPct / 100, { sign: true })} və ya daha çox
            qazanır ({money((gainPct / 100) * res.V0, ccy, { sign: true })})</span></div>
        </div>
        <div className="calc">
          <NumField label={`Qazanc hədəfi (${ccy})`} value={gainMoney} onChange={setGainMoney} min={-Math.round(res.V0)} max={Math.round(res.V0)} step={100} />
          <div className="calc-out"><b>{above(gainMoney / res.V0)}</b><span>ehtimalla qazanc {money(gainMoney, ccy)}-ı keçir</span></div>
        </div>
        <div className="calc">
          <NumField label="Aralığın etibarlılığı" value={band} onChange={setBand} min={10} max={98} step={5} suffix="%" list={[50, 80, 90, 95]} />
          <div className="calc-out">
            <b>{lo != null && hi != null ? `${money(res.V0 * (1 + lo), ccy)} – ${money(res.V0 * (1 + hi), ccy)}` : "—"}</b>
            <span>ssenarilərin {band}%-i bu aralıqdadır ({lo != null && hi != null ? `${pct(lo, { sign: true })} … ${pct(hi, { sign: true })}` : ""})</span>
          </div>
        </div>
      </div>
    </section>
  );
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

      <Hero items={[
        { label: "Portfelin dəyəri", value: money(res.V0, ccy),
          sub: `${money(res.current.total.unrealized, ccy, { sign: true })} (${pct(res.current.total.unrealized_pct, { sign: true })}) cari mənfəət/zərər`,
          subTone: res.current.total.unrealized >= 0 ? "pos" : "neg" },
        { label: `Gözlənilən gəlir · ${dateAz(res.horizon_end)}`, value: m ? pct(m.expected_return, { sign: true }) : money(res.pnl_end.median, ccy, { sign: true }),
          sub: m ? `${money(m.expected_money, ccy, { sign: true })} — bazar riskinin mükafatı` : "mənfəət/zərərin medianı" },
        { label: "10 ssenaridən 9-u bu aralıqda", value: `${money(res.checkpoints[res.checkpoints.length - 1].p05, ccy)} – ${money(res.checkpoints[res.checkpoints.length - 1].p95, ccy)}`,
          sub: m ? `${pct(m.range90[0], { sign: true })} … ${pct(m.range90[1], { sign: true })}` : "dövrün sonunda portfelin dəyəri" },
        { label: "Mənfəətdə bitmə ehtimalı", value: prob(res.pnl_end.prob_profit), sub: "dövrün sonunda maya dəyərindən yuxarı" },
      ]} />

      {!ins || !m ? <OlderRun /> : (<>
      <Memo eyebrow="İnvestisiya · CIO brifinqi" title="Bu portfel pulunuzu necə işlədir?" items={ins.investment.memo}>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Etibarlılıq: <ReliabilityBadge level={run.reliability} /> · riskin ətraflı təhlili və model yoxlaması{" "}
          <Link to="../risk" relative="path">Risk</Link> bölməsindədir.
        </p>
      </Memo>

      <KpiGroups groups={[
        { title: "Gəlir potensialı", hint: "nə qədər qazana bilərəm", items: [
          <Kpi key="beat" label="Depozitdən çox qazanma ehtimalı" value={prob(m.prob_beat_rf)} sub={`risksiz gəlir ${pct(m.rf_period)} (3 ay)`} />,
          <Kpi key="best" label="Yaxşı ssenari (95%)" value={money(m.best_case_money, ccy, { sign: true })} sub={`20 ssenaridən 1-də ${pct(m.best_case, { sign: true })}-dən yaxşı`} />,
          <Kpi key="ud" label="Yuxarı / aşağı asimmetriya" value={ratio(m.upside_downside)} sub=">1: yuxarı potensial aşağı riskdən genişdir" />,
          <Kpi key="gl" label="Qazanc / itki nisbəti (Omega)" value={ratio(m.gain_loss_ratio)} sub="orta qazanc ÷ orta itki" />,
        ] },
        { title: "Risk-gəlir səmərəliliyi", hint: "riskə görə nə qədər ödənilir", items: [
          <Kpi key="sh" label="Sharpe (illik)" value={ratio(m.sharpe)} sub={`Sortino ${ratio(m.sortino)} · volatillik ${pct(m.vol_annual)}`} />,
          <Kpi key="rc" label="Gəlir / CVaR 95%" value={ratio(m.return_to_cvar)} sub="pis ssenari itkisinin hər vahidinə gəlir" />,
          <Kpi key="tr" label="Treynor (illik)" value={ratio(m.treynor)} sub="bazar riskinin hər vahidinə artıq gəlir" />,
          <Kpi key="rv" label="Rachev nisbəti" value={ratio(m.rachev)} sub="ən yaxşı 5% ÷ ən pis 5% ssenari" />,
          <Kpi key="cm" label="Calmar (gözlənilən)" value={ratio(m.calmar)} sub="gözlənilən gəlir ÷ tipik drawdown" />,
        ] },
        { title: "Portfelin quruluşu", hint: "pul necə yerləşdirilib", items: [
          <Kpi key="b" label="Bazar həssaslığı (β)" value={ratio(m.market_sensitivity)}
            sub={`bazar 10% düşsə, portfel təxminən ${pct(-0.1 * m.market_sensitivity, { sign: true })}`} />,
          <Kpi key="dv" label="Diversifikasiya faydası" value={pct(m.diversification_benefit)} sub={`effektiv səhm sayı ≈ ${ratio(m.effective_n, 1)}`} />,
          <Kpi key="tw" label="Ən böyük mövqe" value={pct(m.top_weight)} sub="portfelin payı" />,
          <Kpi key="dd" label="Dividend (alınmış)" value={money(res.current.total.dividends ?? 0, ccy)} sub={`reallaşmış m/z ${money(res.current.total.realized, ccy, { sign: true })}`} />,
        ] },
      ]} />
      </>)}

      <Toolbar res={res} cp={cp} setCp={setCp} unit={unit} setUnit={setUnit} asset={asset} setAsset={setAsset} />
      <SectionNav items={[["summary", "Brifinq"], ["calc", "Kalkulyator"], ["fan", "Proqnoz"], ["efficiency", "Risk-gəlir"], ["source", "Riskin mənbəyi"],
        ["holdings", "Mövqelər"], ["pnl", "Mənfəət/zərər"], ["stocks", "Səhmlər"], ["glossary", "Lüğət"]]} />
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
      <StocksSection res={res} />
      <Glossary res={res}>
        <dt>Gözlənilən gəlir</dt>
        <dd>Risksiz faiz + bazar həssaslığı × bazar risk mükafatı (CAPM). Bu, daşıdığınız bazar riskinin “haqqıdır”, səhm seçimi barədə proqnoz deyil.</dd>
        <dt>Sharpe və Sortino</dt>
        <dd>Risksiz faizdən artıq gözlənilən gəlirin dəyişkənliyə (Sharpe) və ya yalnız aşağı dəyişkənliyə (Sortino) nisbəti, illik.</dd>
        <dt>Gəlir / CVaR</dt>
        <dd>Ən pis 5% ssenaridə itkinin hər vahidinə düşən gözlənilən gəlir: quyruq riskinin qiyməti.</dd>
        <dt>Səmərəlilik</dt>
        <dd>Mövqenin gözlənilən gəlirdəki payının riskdəki (CVaR) payına nisbəti. 1-dən böyük — riskini “qazanır”; kiçik — portfelə baha başa gəlir.</dd>
        <dt>Mükafatlı və mükafatsız risk</dt>
        <dd>Bazarla birgə hərəkət (sistematik risk) gəlirlə mükafatlandırılır; şirkətə xas dəyişkənlik mükafatlandırılmır və diversifikasiya ilə azalır.</dd>
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
      <div className="eyebrow">Risk iştahı</div>
      <div className="big-num">{pct(use)}</div>
      <div className="muted small">limitdən istifadə (CVaR 95% ÷ limit)</div>
      <div className="limit-bar" role="img" aria-label={`Limitdən istifadə ${pct(use)}`}>
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
          ? <>Ehtiyat: <b>{money(m.headroom_money, res.base_currency)}</b></>
          : <>Aşım: <b>{money(-(m.headroom_money ?? 0), res.base_currency)}</b></>}
        {m.beyond_limit != null && <> · limitdən çox itki ehtimalı <b>{prob(m.beyond_limit)}</b></>}
      </p>
    </section>
  );
}

function KriBoard({ run, ins }: { run: RunView; ins: Insights }) {
  const relStatus: Rag = run.reliability === "high" ? "green" : run.reliability === "medium" ? "amber" : run.reliability === "low" ? "red" : "none";
  const rows: Kri[] = [
    ...ins.risk.kri,
    { key: "model", label: "Modelin etibarlılığı (keçmiş məlumatda yoxlama)", value: null, kind: "ratio" as const, status: relStatus,
      hint: run.reliability_text },
  ].sort((a, b) => RAG_ORDER[a.status] - RAG_ORDER[b.status]);
  const counts = { red: rows.filter((r) => r.status === "red").length, amber: rows.filter((r) => r.status === "amber").length };
  return (
    <section className="card" id="kri">
      <div className="card-head">
        <div>
          <h2>Əsas risk göstəriciləri (KRI)</h2>
          <div className="sub">Svetofor: kritik → diqqət → normal. Hədlər admin parametrlərindədir və bütün portfellər üçün eynidir.</div>
        </div>
        <div className="row-actions small">
          <span className="rag red"><span className="dot" aria-hidden="true" /> {counts.red} kritik</span>
          <span className="rag amber"><span className="dot" aria-hidden="true" /> {counts.amber} diqqət</span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="kri">
          <thead><tr><th>Göstərici</th><th className="num">Dəyər</th><th>Status</th><th>Şərh</th></tr></thead>
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
    { name: "Portfel", now: m.vol_now, long: m.vol_long }].reverse();
  const build = (p: Palette): EChartsOption => ({
    ...baseOption(p),
    legend: { top: 0, textStyle: { color: p.muted } },
    grid: { left: 70, right: 24, top: 30, bottom: 36 },
    yAxis: { type: "category", data: rows.map((r) => r.name), ...axisStyle(p), splitLine: { show: false } },
    xAxis: { type: "value", ...axisStyle(p), axisLabel: { color: p.muted, formatter: (v: number) => pct(v) } },
    tooltip: { ...baseOption(p).tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => pct(Number(v)) },
    series: [
      { name: "Uzunmüddətli norma", type: "scatter", data: rows.map((r) => r.long), symbolSize: 9, itemStyle: { color: p.neutral } },
      { name: "İndi", type: "scatter", data: rows.map((r) => r.now), symbolSize: 11,
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
      title="Volatillik rejimi: indi normadan yüksəkdirmi?"
      subtitle={`Boz — uzunmüddətli norma, rəngli — bugünkü proqnoz (illik). Vermilion — risk normadan yüksəkdir, göy — aşağı. Portfel: ${ratio(m.vol_regime)}× norma.`}
      build={build}
      deps={[ins]}
      ariaLabel="Bugünkü və uzunmüddətli volatillik müqayisəsi"
      height={rows.length > 8 ? "tall" : "short"}
      table={
        <table>
          <thead><tr><th>Səhm</th><th className="num">İndi</th><th className="num">Norma</th><th className="num">Nisbət</th><th className="num">Satış müddəti</th></tr></thead>
          <tbody>
            {ins.risk.assets.map((a) => (
              <tr key={a.symbol}><td>{a.symbol}</td><td className="num">{pct(a.now)}</td><td className="num">{pct(a.long)}</td>
                <td className="num">{ratio(a.ratio)}×</td>
                <td className="num">{a.liquidity_days == null ? "—" : a.liquidity_days < 0.1 ? "<0,1 gün" : `${ratio(a.liquidity_days, 1)} gün`}</td></tr>
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
          <tr><th>Güvən səviyyəsi</th><th className="num">VaR</th><th className="num">VaR, məbləğ</th><th className="num">CVaR</th>
            <th className="num">CVaR, məbləğ</th><th>Tezlik</th></tr>
        </thead>
        <tbody>
          {levels.map((l) => {
            const v = riskAt(res, grid, l);
            if (!v) return null;
            return (
              <tr key={l}>
                <td>{levelPct(l)}</td><td className="num">{pct(v.var)}</td><td className="num">{money(v.var * res.V0, ccy)}</td>
                <td className="num">{pct(v.cvar)}</td><td className="num">{money(v.cvar * res.V0, ccy)}</td>
                <td className="small muted">{frequency(1 - l)} itki VaR-dan çox olur</td>
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
    !x ? "göstərilmir" : x.bound === "lt" ? "<0,1%" : x.bound === "gt" ? ">99,9%" : prob(x.p);
  const beta = ins?.investment.metrics.market_sensitivity;
  const positions = ins?.investment.positions ?? [];
  return (
    <section className="card" id="calc">
      <div className="card-head">
        <div>
          <h2>Risk kalkulyatoru</h2>
          <div className="sub">Öz rəqəmlərinizi yazın — cavab dərhal eyni {res.scenarios.toLocaleString("az")} ssenaridən hesablanır, yeni Generate lazım deyil.</div>
        </div>
      </div>
      <div className="calc-grid">
        <div className="calc">
          <NumField label="İtki həddi" value={lossPct} onChange={setLossPct} min={0.5} max={80} step={1} suffix="%" list={[5, 10, 15, 20, 30]} />
          <div className="calc-out"><b>{fmtP(pL)}</b><span>ehtimalla 3 ayın sonunda portfel bu qədər və ya daha çox itirir
            ({money((lossPct / 100) * res.V0, ccy)})</span></div>
        </div>
        <div className="calc">
          <NumField label={`İtki həddi (${ccy})`} value={lossMoney} onChange={setLossMoney} min={1} max={Math.round(res.V0)} step={100} />
          <div className="calc-out"><b>{fmtP(pM)}</b><span>ehtimalla itki {money(lossMoney, ccy)}-ı keçir
            ({pct(lossMoney / res.V0)} portfelin)</span></div>
        </div>
        {beta != null && (
          <div className="calc">
            <NumField label="Bazar şoku (S&P 500 və s.)" value={shock} onChange={setShock} min={-60} max={60} step={5} suffix="%" list={[-30, -20, -10, 10, 20]} />
            <div className="calc-out"><b className={shock * beta < 0 ? "neg" : "pos"}>{pct((shock / 100) * beta, { sign: true })}</b>
              <span>təxmini portfel dəyişikliyi ({money((shock / 100) * beta * res.V0, ccy, { sign: true })}); bazar həssaslığı {ratio(beta)}</span></div>
          </div>
        )}
      </div>
      {beta != null && positions.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small">Bazar şokunun mövqelərə bölgüsü</summary>
          <table className="small" style={{ marginTop: 8 }}>
            <thead><tr><th>Səhm</th><th className="num">Həssaslıq (β)</th><th className="num">Dəyişiklik</th><th className="num">Məbləğ</th></tr></thead>
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
          <p className="small muted">Xətti təxmindir: yalnız bazarla birgə hərəkəti nəzərə alır, şirkətə xas xəbərləri yox.</p>
        </details>
      )}
      <h3 style={{ marginTop: 18 }}>VaR / CVaR nərdivanı</h3>
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

      <Hero items={[
        { label: `VaR ${lvText} · 3 ay`, value: money(risk.var * res.V0, ccy),
          sub: `${pct(risk.var)} · ${frequency(1 - lv)} itki bundan çox olur`, tone: "neg" },
        { label: `CVaR ${lvText} · 3 ay`, value: money(risk.cvar * res.V0, ccy),
          sub: `${pct(risk.cvar)} · ən pis ${levelPct(1 - lv)} ssenarinin orta itkisi`, tone: "neg" },
        { label: "Dövr ərzində tipik ən dərin düşmə", value: pct(res.drawdown.mdd_percentiles["50"]),
          sub: `20 rübdən 1-də ${pct(res.drawdown.mdd_percentiles["5"])}-dən pis` },
        { label: "3 ayın sonunda itkidə olma", value: m ? prob(m.prob_loss) : prob(res.checkpoints[res.checkpoints.length - 1].prob_loss_vs_today),
          sub: "bugünkü dəyərdən aşağı bitmə ehtimalı" },
      ]} />

      {ins ? (
        <div className="cro-top">
          <Appetite res={res} ins={ins} />
          <Memo eyebrow="Risk · CRO paneli" title="Nə səhv gedə bilər və nə qədər?" items={ins.risk.memo} />
        </div>
      ) : <OlderRun />}

      {m && (
        <KpiGroups groups={[
          { title: "Dəyişkənlik", hint: "qiymət nə qədər tərpənir", items: [
            <Kpi key="v" label="Volatillik (illik, indi)" value={pct(m.vol_now)} sub={`norma ${pct(m.vol_long)} · ${ratio(m.vol_regime)}×`} />,
            <Kpi key="sd" label="Aşağı yarımsapma (illik)" value={pct(m.semidev_annual)} sub="yalnız itkiləri sayan dəyişkənlik" />,
            <Kpi key="c" label="Orta korrelyasiya" value={ratio(m.corr_now)}
              sub={m.corr_pair ? `ən güclü cüt ${m.corr_pair.a}–${m.corr_pair.b} ${ratio(m.corr_pair.value)}` : "tək mövqe"} />,
          ] },
          { title: "Quyruq riski", hint: "nadir, amma ağır hallar", items: [
            ...(m.worst_case != null ? [<Kpi key="w" label="Ən pis ssenari (0,1%)" value={pct(m.worst_case, { sign: true })}
              sub={`${money(m.worst_case * res.V0, ccy, { sign: true })} · 1000 ssenaridən 1-i`} />] : []),
            <Kpi key="sk" label="Asimmetriya (skewness)" value={ratio(m.skewness)} sub="<0: pis sürprizlər yaxşılardan böyükdür" />,
            <Kpi key="ku" label="Quyruq qalınlığı (artıq kurtoz)" value={ratio(m.excess_kurtosis)} sub=">0: ekstremal hallar normaldan tez-tez" />,
          ] },
        ]} />
      )}
      {res.hidden_99 && <div className="banner warn"><span className="ic">⚠</span> Model bəzi yoxlamalardan keçmədiyi üçün ekstremal (98%-dən yuxarı) göstəricilər gizlədilib.</div>}

      <Toolbar res={res} cp={cp} setCp={setCp} unit={unit} setUnit={setUnit} level={lv} setLevel={setLevel} levelMax={top} />
      <SectionNav items={[["summary", "Brifinq"], ["calc", "Kalkulyator"], ["kri", "KRI"], ["dist", "Quyruq"], ["drawdown", "Drawdown"],
        ["regime", "Rejim"], ["contrib", "Konsentrasiya"], ["stress", "Stress"], ["trust", "Model riski"], ["glossary", "Lüğət"]]} />
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
        <dt>Risk iştahı və limit</dt>
        <dd>Limit — 3 ayda ən pis 5% ssenaridə qəbul etdiyiniz orta itki (CVaR 95%). İstifadə 100%-i keçəndə portfel iştahınızdan risklidir.</dd>
        <dt>Güvən səviyyəsini dəyişmək</dt>
        <dd>VaR və CVaR istənilən səviyyədə (məs. 97,5% — Bazel standartı) eyni ssenarilərdən hesablanır. Səviyyə yüksəldikcə rəqəm böyüyür, amma hadisə nadirləşir.</dd>
        <dt>KRI və svetofor</dt>
        <dd>Əsas risk göstəriciləri: hər biri sabit hədlərlə müqayisə olunur. “Diqqət” — izləmək, “kritik” — qərar tələb edir.</dd>
        <dt>Volatillik rejimi</dt>
        <dd>Bugünkü proqnoz volatilliyin modelin uzunmüddətli normasına nisbəti. 1-dən böyük — bazar normadan təlatümlüdür.</dd>
        <dt>Skewness və kurtoz</dt>
        <dd>Paylanmanın forması: mənfi skewness — böyük itkilər böyük qazanclardan ehtimallıdır; müsbət artıq kurtoz — ekstremal günlər normal paylanmadan daha tez-tez olur.</dd>
        <dt>Aşağı yarımsapma</dt>
        <dd>Yalnız mənfi nəticələri nəzərə alan dəyişkənlik: “yuxarı” dəyişkənlik risk sayılmır.</dd>
      </Glossary>
      <p className="disclaimer">{run.disclaimer}</p>
    </>
  );
}
