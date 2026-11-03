import { Link } from "react-router-dom";
import { useApp } from "../App";
import { portfolioState, ReliabilityBadge } from "../components/Badges";
import { Icon } from "../components/Icons";
import { dateTimeAz, money, pct, prob } from "../format";
import { Key, t } from "../i18n";
import { L } from "../lang";

export default function PortfoliosPage() {
  const { portfolios, openNewPortfolio, config, user } = useApp();

  if (portfolios === null) return <div className="muted">{L("Yüklənir…", "Loading…")}</div>;

  if (portfolios.length === 0) {
    return (
      <div className="card empty">
        <h1 style={{ marginBottom: 6 }}>{L("Xoş gəlmisiniz", "Welcome")}</h1>
        <p className="muted">{L("Portfelinizin növbəti 3 ay üçün risk və mənfəət/zərər təhlilini almaq üç addımdır.", "Getting a risk and profit/loss analysis of your portfolio for the next 3 months takes three steps.")}</p>
        <div className="steps-intro">
          <div><span className="stepnum">1</span><b>{L("Portfel yaradın", "Create a portfolio")}</b><span className="muted small">{L("Ad, valyuta və risk profili seçin.", "Choose a name, currency and risk profile.")}</span></div>
          <div><span className="stepnum">2</span><b>{L("Səhmləri əlavə edin", "Add stocks")}</b><span className="muted small">{L("Simvol və say kifayətdir; tarix və qiymət istəyə bağlıdır.", "A symbol and quantity are enough; date and price are optional.")}</span></div>
          <div><span className="stepnum">3</span><b>{L("Generate basın", "Press Generate")}</b><span className="muted small">{L("1–3 dəqiqəyə ehtimal proqnozu, risk və tövsiyələr hazır olur.", "In 1–3 minutes the probabilistic forecast, risk and recommendations are ready.")}</span></div>
        </div>
        <button className="primary" onClick={openNewPortfolio}><Icon name="plus" size={16} /> {L("İlk portfeli yarat", "Create your first portfolio")}</button>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{L("Portfellərim", "My portfolios")}</h1>
          <div className="lead">
            {user?.email} · {portfolios.length} {L("portfel. Hər portfel ayrıca yadda saxlanılır və müstəqil təhlil olunur.", "portfolio(s). Each is stored and analysed separately.")}
          </div>
        </div>
        <button className="primary" onClick={openNewPortfolio}><Icon name="plus" size={16} /> {t("newPortfolio")}</button>
      </div>
      <div className="p-grid">
        {portfolios.map((p) => {
          const st = portfolioState(p);
          const r = p.last_run;
          const limit = p.risk_limit ?? config?.risk_profiles[p.risk_profile];
          const h = p.headline;
          const use = h?.cvar95 != null && h.risk_limit ? h.cvar95 / h.risk_limit : null;
          return (
            <Link key={p.id} to={`/portfolios/${p.id}${h ? "/today" : ""}`} className="p-card">
              <div className="p-head">
                <span className="p-title">{p.name}</span>
                <span className="badge checking">{p.base_currency}</span>
              </div>
              {h ? (
                <>
                  <div className="p-value">
                    <span className="big">{money(h.value, p.base_currency)}</span>
                    {h.unrealized != null && (
                      <span className={h.unrealized >= 0 ? "pos" : "neg"}>
                        {money(h.unrealized, p.base_currency, { sign: true })} ({pct(h.unrealized_pct, { sign: true })})
                      </span>
                    )}
                  </div>
                  <div className="p-stats">
                    <div>{L("3 ay sonra (90%)", "In 3 months (90%)")}<b>{h.range90 ? `${pct(h.range90[0], { sign: true })} … ${pct(h.range90[1], { sign: true })}` : "—"}</b></div>
                    <div>{L("Mənfəət ehtimalı", "Profit probability")}<b>{h.prob_profit != null ? prob(h.prob_profit) : "—"}</b></div>
                  </div>
                  {use != null && (
                    <div className="p-risk" title={L("Ən pis 5% ssenaridə 3 aylıq orta itki (CVaR 95%) risk limitinizə nisbətən", "Average 3-month loss in the worst 5% of scenarios (CVaR 95%) relative to your risk limit")}>
                      <div className="row-actions" style={{ justifyContent: "space-between" }}>
                        <span>{L("Risk limitindən istifadə", "Use of the risk limit")}</span>
                        <b className={use > 1 ? "neg" : undefined}>{pct(use)}</b>
                      </div>
                      <div className="mini-bar"><div className={use > 1 ? "over" : use > 0.8 ? "near" : ""} style={{ width: `${Math.min(100, use * 80)}%` }} /><span style={{ left: "80%" }} /></div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-stats">
                  <div>{L("Səhm", "Stocks")}<b>{p.n_instruments}</b></div>
                  <div>{t("riskProfile")}<b>{t(p.risk_profile as Key)}{limit != null ? ` · ${pct(limit)}` : ""}</b></div>
                </div>
              )}
              <div className="p-foot">
                {r?.status === "done" && !r.stale ? (
                  <ReliabilityBadge level={r.reliability} />
                ) : (
                  <span className={`badge ${st.cls === "stale" ? "warn" : st.cls === "failed" ? "err" : "checking"}`}>
                    <span className={`dot ${st.cls}`} aria-hidden="true" /> {st.label}
                  </span>
                )}
                <span className="small muted">{p.n_instruments} {L("səhm", "stocks")} · {r ? dateTimeAz(r.created_at) : t("never")}</span>
                <span className="spacer" />
                <span className="go">{h ? L("Nəticələr →", "Results →") : L("Aç →", "Open →")}</span>
              </div>
            </Link>
          );
        })}
        <button className="p-card new" onClick={openNewPortfolio}>
          <Icon name="plus" size={22} />
          {t("newPortfolio")}
        </button>
      </div>
    </>
  );
}
