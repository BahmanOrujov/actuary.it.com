import { ReliabilityBadge } from "../components/Badges";
import { money, num, pct, prob } from "../format";
import { NoResults, usePortfolio } from "./PortfolioLayout";
import { L } from "../lang";

const ACTION: Record<string, [string, string]> = {
  reduce: ["↓", L("azalt", "reduce")],
  increase: ["↑", L("artır", "increase")],
  hold: ["=", L("saxla", "hold")],
  attention: ["⚠", L("diqqət", "attention")],
};

export default function RecommendationsPage() {
  const { run, runLoaded } = usePortfolio();
  if (!run || run.status !== "done" || !run.result) return <NoResults run={run} runLoaded={runLoaded} />;

  const res = run.result;
  const ccy = res.base_currency;
  const recs = [...(run.recommendations ?? [])].sort((a, b) => order(a.action) - order(b.action));
  const cvar = res.risk["0.95"];
  const over = cvar.cvar_pct > res.risk_limit;
  const scale = Math.max(cvar.cvar_pct, res.risk_limit) * 1.25 || 1;

  return (
    <>
      {run.stale && (
        <div className="banner warn"><span className="ic">⚠</span> {L("Portfel dəyişib. Tövsiyələr köhnə tərkibə aiddir — Generate düyməsini basın.", "The portfolio has changed. The recommendations refer to the old holdings — press Generate.")}</div>
      )}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{L("Risk limitiniz", "Your risk limit")}</h2>
            <div className="sub">{L("Ən pis 5% ssenaridə 3 aylıq orta itki (CVaR 95%) sizin limitinizlə müqayisədə.", "Average 3-month loss in the worst 5% of scenarios (CVaR 95%) against your limit.")}</div>
          </div>
          {over ? <span className="badge err">✕ {L("limit keçilib", "limit exceeded")}</span> : <span className="badge ok">✓ {L("limit daxilində", "within the limit")}</span>}
        </div>
        <p style={{ fontSize: 15 }}>
          CVaR 95%: <b>{money(cvar.cvar_money, ccy)}</b> ({pct(cvar.cvar_pct)}) · limit: <b>{pct(res.risk_limit)}</b>
        </p>
        <div className="limit-bar" role="img" aria-label={`CVaR ${pct(cvar.cvar_pct)}, limit ${pct(res.risk_limit)}`}>
          <div style={{ width: `${Math.min(100, (cvar.cvar_pct / scale) * 100)}%`, background: over ? "var(--neg)" : "var(--q)" }} />
          <span className="mark" style={{ left: `${(res.risk_limit / scale) * 100}%` }} title="limit" />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          {L("Tövsiyələr gələcək risk və gəlirə əsaslanır, mövqenin hazırda mənfəətdə və ya zərərdə olmasına yox.", "Recommendations are based on future risk and return, not on whether a position is currently in profit or loss.")}{" "}
          {L("Etibarlılıq", "Reliability")}: <ReliabilityBadge level={run.reliability} />
        </p>
      </section>

      {recs.length === 0 && <div className="card muted">{L("Bu portfel üçün tövsiyə yoxdur.", "There are no recommendations for this portfolio.")}</div>}
      {recs.map((r, i) => {
        const [icon, label] = ACTION[r.action] ?? ["•", r.action];
        return (
          <section key={i} className={`card rec ${r.action}`}>
            <div className="card-head" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>
                <span aria-hidden="true">{icon}</span> {label.toLocaleUpperCase("az")}: {r.name ?? r.symbol ?? ""}
              </h3>
              <ReliabilityBadge level={r.reliability} />
            </div>
            <p>{r.reason}</p>
            {(r.action === "reduce" || r.action === "increase") && (
              <p>
                {L("Miqdar", "Amount")}: <b>{num(r.shares, 4)} {L("səhm", "shares")}</b> (~{money(r.money, ccy)})
              </p>
            )}
            {r.prob_target != null && <p className="small">{L("Hədəfə çatma (sonda)", "Reaching the target (at the end)")}: {prob(r.prob_target)}</p>}
            <p className="small muted" style={{ marginBottom: 4 }}>
              CVaR 95%: {L("əvvəl", "before")} {money(r.cvar_before, ccy)} ({pct(r.cvar_before_pct)}) → {L("sonra", "after")} {money(r.cvar_after, ccy)} ({pct(r.cvar_after_pct)})
            </p>
            <p className="small muted" style={{ margin: 0 }}>{r.disclaimer}</p>
          </section>
        );
      })}
      <p className="disclaimer" role="note">{run.disclaimer}</p>
      <p className="small muted">
        {L("Monitorinq: faktiki qiymət 90% aralıqdan çıxanda bildiriş gəlir və mövqeyə yenidən baxmaq tövsiyə olunur. Bu, avtomatik satış deyil.",
          "Monitoring: when the actual price leaves the 90% range you get a notification suggesting a review of the position. This is not an automatic sale.")}
      </p>
    </>
  );
}

function order(a: string) {
  return { reduce: 0, attention: 1, increase: 2, hold: 3 }[a] ?? 4;
}
