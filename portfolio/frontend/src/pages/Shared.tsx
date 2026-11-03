import { useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { api, PortfolioSummary, SharedView } from "../api";
import { ReliabilityBadge } from "../components/Badges";
import { ResultTabs } from "./Views";
import { Icon } from "../components/Icons";
import { dateTimeAz } from "../format";
import { Key, t } from "../i18n";
import { L } from "../lang";
import { PortfolioOutlet } from "./PortfolioLayout";
import LangSwitch from "../components/LangSwitch";

/** Read-only page behind a share link: the owner's latest results, no login, nothing editable. */
export default function SharedLayout() {
  const { token = "" } = useParams();
  const [view, setView] = useState<SharedView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SharedView>(`/api/shared/${encodeURIComponent(token)}`).then(setView).catch((e) => setError((e as Error).message));
  }, [token]);

  const head = (
    <div className="shared-top">
      <span className="brand-mini"><Icon name="chart" size={18} /> {t("brand")}</span>
      <LangSwitch />
    </div>
  );

  if (error) {
    return (
      <main className="page">
        {head}
        <div className="card empty">
          <h2>{L("Paylaşılmış portfel açılmadı", "The shared portfolio could not be opened")}</h2>
          <p className="muted">{error}</p>
          <Link to="/login">{L("Öz portfelinizi təhlil edin", "Analyse your own portfolio")}</Link>
        </div>
      </main>
    );
  }
  if (!view) return <main className="page muted">{L("Yüklənir…", "Loading…")}</main>;

  // the result views read only the run from the outlet context; the summary fields are not shown here
  const outlet: PortfolioOutlet = { summary: { name: view.name } as PortfolioSummary, run: view.run, runLoaded: true };
  const base = `/shared/${encodeURIComponent(token)}`;
  return (
    <main className="page">
      {head}
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{L("Paylaşılmış portfel · yalnız baxış", "Shared portfolio · view only")}</div>
          <h1>{view.name}</h1>
          <div className="chips">
            <span>{view.base_currency}</span>
            <span>{t(view.risk_profile as Key)} {L("profil", "profile")}</span>
            {view.run && <span>{t("lastGenerate")}: {dateTimeAz(view.run.created_at)}</span>}
            {view.run && <ReliabilityBadge level={view.run.reliability} />}
          </div>
        </div>
        <Link className="btn" to="/login">{L("Öz portfelinizi təhlil edin", "Analyse your own portfolio")}</Link>
      </div>
      <nav className="tabs" aria-label={L("Bölmələr", "Sections")}>
        <ResultTabs base={base} />
      </nav>
      <Outlet context={outlet} />
    </main>
  );
}
