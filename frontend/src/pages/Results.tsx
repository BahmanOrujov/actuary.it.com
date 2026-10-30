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
import { NoResults, usePortfolio } from "./PortfolioLayout";

// ---------------------------------------------------------------- shared

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
      <h2 style={{ fontSize: 18, margin: "4px 0 12px" }}>{title}</h2>
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

function useResult(): { run: RunView; res: RunResult; ins: Insights } | { empty: JSX.Element } {
  const { run, runLoaded } = usePortfolio();
  const res = run?.status === "done" ? run.result : undefined;
  if (!run || !res) return { empty: <NoResults run={run} runLoaded={runLoaded} /> };
  if (!res.insights) {
    return {
      empty: (
        <div className="card empty">
          <h2>Bu nəticə köhnə versiyada hesablanıb</h2>
          <p className="muted">İnvestisiya və risk baxışları üçün yuxarıdakı Generate düyməsini yenidən basın.</p>
        </div>
      ),
    };
  }
  return { run, res, ins: res.insights };
}

function Toolbar({ res, cp, setCp, unit, setUnit, level, setLevel, asset, setAsset }: {
  res: RunResult; cp: number; setCp: (n: number) => void; unit: Unit; setUnit: (u: Unit) => void;
  level?: "0.95" | "0.99"; setLevel?: (l: "0.95" | "0.99") => void; asset?: string; setAsset?: (s: string) => void;
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
      {level && setLevel && (
        <label>
          VaR səviyyəsi
          <select value={level} onChange={(e) => setLevel(e.target.value as "0.95" | "0.99")}>
            <option value="0.95">95%</option>
            <option value="0.99" disabled={!res.risk["0.99"]}>99%{!res.risk["0.99"] ? " (gizlədilib)" : ""}</option>
          </select>
        </label>
      )}
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
        label: { show: true, formatter: r.symbol, position: "right", color: p.fg, fontSize: 11 },
      })),
      markLine: { silent: true, symbol: "none", lineStyle: { color: p.muted, type: "dashed" as const },
        label: { formatter: "ədalətli bölgü", color: p.muted, fontSize: 11, position: "insideEndTop" as const },
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

export function InvestmentView() {
  const r = useResult();
  const [cp, setCp] = useCheckpoint("res" in r ? r.res : undefined, "run" in r ? r.run.id : undefined);
  const [unit, setUnit] = useState<Unit>("money");
  const [asset, setAsset] = useState("__portfolio");
  const [showPaths, setShowPaths] = useState(true);
  if ("empty" in r) return r.empty;
  const { run, res, ins } = r;
  const m = ins.investment.metrics;
  const ccy = res.base_currency;

  return (
    <>
      {res.warnings.map((w) => <div key={w} className="banner warn"><span className="ic">⚠</span> {w}</div>)}
      <Toolbar res={res} cp={cp} setCp={setCp} unit={unit} setUnit={setUnit} asset={asset} setAsset={setAsset} />
      <SectionNav items={[["summary", "Brifinq"], ["fan", "Proqnoz"], ["efficiency", "Risk-gəlir"], ["source", "Riskin mənbəyi"],
        ["holdings", "Mövqelər"], ["pnl", "Mənfəət/zərər"], ["stocks", "Səhmlər"], ["glossary", "Lüğət"]]} />

      <Memo eyebrow="İnvestisiya · CIO brifinqi" title="Bu portfel pulunuzu necə işlədir?" items={ins.investment.memo}>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Etibarlılıq: <ReliabilityBadge level={run.reliability} /> · riskin ətraflı təhlili və model yoxlaması{" "}
          <Link to="../risk" relative="path">Risk</Link> bölməsindədir.
        </p>
      </Memo>

      <div className="score-grid">
        <Kpi label={`Gözlənilən gəlir · ${res.horizon_days} gün`} value={pct(m.expected_return, { sign: true })}
          sub={`${money(m.expected_money, ccy, { sign: true })} · risksiz faiz ${pct(m.rf_period)}`} />
        <Kpi label="Mənfəətdə bitmə ehtimalı" value={prob(res.pnl_end.prob_profit)} sub={`bu günə nisbətən qazanc: ${prob(m.prob_gain)}`} />
        <Kpi label="90% nəticə aralığı" value={`${pct(m.range90[0], { sign: true })} … ${pct(m.range90[1], { sign: true })}`}
          sub="10 ssenaridən 9-u bu aralıqdadır" />
        <Kpi label="Sharpe (illik, gözlənilən)" value={ratio(m.sharpe)} sub={`Sortino ${ratio(m.sortino)} · volatillik ${pct(m.vol_annual)}`} />
        <Kpi label="Gəlir / CVaR 95%" value={ratio(m.return_to_cvar)} sub="pis ssenari itkisinin hər vahidinə gəlir" />
        <Kpi label="Qazanc / itki nisbəti" value={ratio(m.gain_loss_ratio)} sub="orta qazanc ÷ orta itki (Omega)" />
        <Kpi label="Yuxarı / aşağı asimmetriya" value={ratio(m.upside_downside)} sub=">1: yuxarı potensial aşağı riskdən genişdir" />
        <Kpi label="Bazar həssaslığı (β)" value={ratio(m.market_sensitivity)}
          sub={`bazar 10% düşsə, portfel təxminən ${pct(-0.1 * m.market_sensitivity, { sign: true })}`} />
        <Kpi label="Diversifikasiya faydası" value={pct(m.diversification_benefit)} sub={`effektiv səhm sayı ≈ ${ratio(m.effective_n, 1)}`} />
        <Kpi label="Cari mənfəət/zərər" value={money(res.current.total.unrealized, ccy, { sign: true })}
          sub={`${pct(res.current.total.unrealized_pct, { sign: true })} · dividend ${money(res.current.total.dividends ?? 0, ccy)}`} />
      </div>

      <FanChart res={res} unit={unit} asset={asset} showPaths={showPaths} setShowPaths={setShowPaths} />
      {ins.investment.positions.length > 1 && <EfficiencyMap ins={ins} />}
      <div className="grid two">
        <RiskSource ins={ins} />
        <Exposure ins={ins} />
      </div>
      <Holdings res={res} ins={ins} />
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

export function RiskView() {
  const r = useResult();
  const [cp, setCp] = useCheckpoint("res" in r ? r.res : undefined, "run" in r ? r.run.id : undefined);
  const [unit, setUnit] = useState<Unit>("money");
  const [level, setLevel] = useState<"0.95" | "0.99">("0.95");
  if ("empty" in r) return r.empty;
  const { run, res, ins } = r;
  const ccy = res.base_currency;
  const lv = res.risk[level] ? level : "0.95";
  const risk = res.risk[lv];
  const m = ins.risk.metrics;

  return (
    <>
      {res.warnings.map((w) => <div key={w} className="banner warn"><span className="ic">⚠</span> {w}</div>)}
      <Toolbar res={res} cp={cp} setCp={setCp} unit={unit} setUnit={setUnit} level={level} setLevel={setLevel} />
      <SectionNav items={[["summary", "Brifinq"], ["kri", "KRI"], ["dist", "Quyruq"], ["drawdown", "Drawdown"], ["regime", "Rejim"],
        ["contrib", "Konsentrasiya"], ["stress", "Stress"], ["trust", "Model riski"], ["glossary", "Lüğət"]]} />

      <div className="cro-top">
        <Appetite res={res} ins={ins} />
        <Memo eyebrow="Risk · CRO paneli" title="Nə səhv gedə bilər və nə qədər?" items={ins.risk.memo} />
      </div>

      <div className="score-grid">
        <Kpi label={`VaR ${Number(lv) * 100}% · 3 ay`} value={money(risk.var_money, ccy)}
          sub={`${pct(risk.var_pct)} · ${frequency(1 - Number(lv))} itki bundan çox olur`} />
        <Kpi label={`CVaR ${Number(lv) * 100}% · 3 ay`} value={money(risk.cvar_money, ccy)}
          sub={`${pct(risk.cvar_pct)} · ən pis ${Math.round((1 - Number(lv)) * 100)}% ssenarinin orta itkisi`} />
        <Kpi label="Maksimal drawdown (median)" value={pct(res.drawdown.mdd_percentiles["50"])}
          sub={`20 rübdən 1-də ${pct(res.drawdown.mdd_percentiles["5"])}-dən pis`} />
        <Kpi label="Volatillik (illik, indi)" value={pct(m.vol_now)} sub={`norma ${pct(m.vol_long)} · ${ratio(m.vol_regime)}×`} />
        <Kpi label="Orta korrelyasiya" value={ratio(m.corr_now)}
          sub={m.corr_pair ? `ən güclü cüt ${m.corr_pair.a}–${m.corr_pair.b} ${ratio(m.corr_pair.value)}` : "tək mövqe"} />
      </div>
      {res.hidden_99 && <div className="banner warn"><span className="ic">⚠</span> Model bəzi yoxlamalardan keçmədiyi üçün 99% göstəriciləri gizlədilib.</div>}

      <KriBoard run={run} ins={ins} />
      <Distribution res={res} level={lv} />
      <Drawdown res={res} />
      <VolRegime ins={ins} />
      {res.assets.length > 1 && <RiskContribution res={res} />}
      {res.correlation && <Correlation res={res} />}
      <Stress res={res} unit={unit} showLimit />
      <TrustPanel run={run} />
      <Glossary res={res}>
        <dt>Risk iştahı və limit</dt>
        <dd>Limit — 3 ayda ən pis 5% ssenaridə qəbul etdiyiniz orta itki (CVaR 95%). İstifadə 100%-i keçəndə portfel iştahınızdan risklidir.</dd>
        <dt>KRI və svetofor</dt>
        <dd>Əsas risk göstəriciləri: hər biri sabit hədlərlə müqayisə olunur. “Diqqət” — izləmək, “kritik” — qərar tələb edir.</dd>
        <dt>Volatillik rejimi</dt>
        <dd>Bugünkü proqnoz volatilliyin modelin uzunmüddətli normasına nisbəti. 1-dən böyük — bazar normadan təlatümlüdür.</dd>
        <dt>Quyruq dərinliyi</dt>
        <dd>CVaR-ın VaR-a nisbəti: pis zonaya düşəndə itkinin sərhəddən nə qədər dərin olduğu.</dd>
      </Glossary>
      <p className="disclaimer">{run.disclaimer}</p>
    </>
  );
}
