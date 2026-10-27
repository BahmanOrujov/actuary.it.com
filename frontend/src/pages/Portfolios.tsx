import { Link } from "react-router-dom";
import { useApp } from "../App";
import { portfolioState, ReliabilityBadge } from "../components/Badges";
import { Icon } from "../components/Icons";
import { dateTimeAz, pct } from "../format";
import { Key, t } from "../i18n";

export default function PortfoliosPage() {
  const { portfolios, openNewPortfolio, config, user } = useApp();

  if (portfolios === null) return <div className="muted">Yüklənir…</div>;

  if (portfolios.length === 0) {
    return (
      <div className="card empty">
        <h1 style={{ marginBottom: 6 }}>Xoş gəlmisiniz</h1>
        <p className="muted">Portfelinizin növbəti 3 ay üçün risk və mənfəət/zərər təhlilini almaq üç addımdır.</p>
        <div className="steps-intro">
          <div><span className="stepnum">1</span><b>Portfel yaradın</b><span className="muted small">Ad, valyuta və risk profili seçin.</span></div>
          <div><span className="stepnum">2</span><b>Səhmləri əlavə edin</b><span className="muted small">Simvol və say kifayətdir; tarix və qiymət istəyə bağlıdır.</span></div>
          <div><span className="stepnum">3</span><b>Generate basın</b><span className="muted small">1–3 dəqiqəyə ehtimal proqnozu, risk və tövsiyələr hazır olur.</span></div>
        </div>
        <button className="primary" onClick={openNewPortfolio}><Icon name="plus" size={16} /> İlk portfeli yarat</button>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Portfellərim</h1>
          <div className="lead">
            {user?.email} · {portfolios.length} portfel. Hər portfel ayrıca yadda saxlanılır və müstəqil təhlil olunur.
          </div>
        </div>
        <button className="primary" onClick={openNewPortfolio}><Icon name="plus" size={16} /> {t("newPortfolio")}</button>
      </div>
      <div className="p-grid">
        {portfolios.map((p) => {
          const st = portfolioState(p);
          const r = p.last_run;
          const limit = p.risk_limit ?? config?.risk_profiles[p.risk_profile];
          return (
            <Link key={p.id} to={`/portfolios/${p.id}${r?.status === "done" ? "/results" : ""}`} className="p-card">
              <div className="row-actions" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <span className="p-title">{p.name}</span>
                <span className="badge checking">{p.base_currency}</span>
              </div>
              <div className="p-stats">
                <div>Səhm<b>{p.n_instruments}</b></div>
                <div>Risk profili<b>{t(p.risk_profile as Key)}{limit != null ? ` · ${pct(limit)}` : ""}</b></div>
                <div style={{ gridColumn: "1 / -1" }}>{t("lastGenerate")}<b>{r ? dateTimeAz(r.created_at) : t("never")}</b></div>
              </div>
              <div className="p-foot">
                {r?.status === "done" && !r.stale ? (
                  <ReliabilityBadge level={r.reliability} />
                ) : (
                  <span className={`badge ${st.cls === "stale" ? "warn" : st.cls === "failed" ? "err" : "checking"}`}>
                    <span className={`dot ${st.cls}`} aria-hidden="true" /> {st.label}
                  </span>
                )}
                <span className="spacer" />
                <span className="small" style={{ color: "var(--q)" }}>{r?.status === "done" ? "Nəticələr →" : "Aç →"}</span>
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
