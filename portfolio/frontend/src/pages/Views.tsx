import { NavLink, Navigate, Outlet, Route, useOutletContext } from "react-router-dom";
import { Icon } from "../components/Icons";
import { t } from "../i18n";
import { L } from "../lang";
import RecommendationsPage from "./Recommendations";
import { InvestmentView, RiskView, ValuationView } from "./Results";
import { TodayInvestment, TodayRisk } from "./Today";
import WhatIfPage from "./WhatIf";

/** Results come in two views with the same four parts: "today" (actual past prices) and "forecast" (the model). */
function ViewLayout({ basis, whatIf }: { basis: "today" | "forecast"; whatIf: boolean }) {
  const ctx = useOutletContext();
  return (
    <>
      <div className="view-head">
        <p className="small muted" style={{ margin: 0 }}>
          {basis === "today"
            ? L("Bu gün: bugünkü tərkib və onun keçmiş faktiki qiymətləri. Model yoxdur.", "Today: the current holdings and their actual past prices. No model.")
            : L("Proqnoz: növbəti 3 ay üçün modelin ssenariləri.", "Forecast: the model's scenarios for the next 3 months.")}
        </p>
        <nav className="subtabs" aria-label={basis === "today" ? L("Bu gün", "Today") : L("Proqnoz", "Forecast")}>
          <NavLink to="investment"><Icon name="chart" size={15} /> {L("İnvestisiya", "Investment")}</NavLink>
          <NavLink to="risk"><Icon name="shield" size={15} /> Risk</NavLink>
          <NavLink to="recommendations"><Icon name="bulb" size={15} /> {t("recommendations")}</NavLink>
          {whatIf && <NavLink to="whatif"><Icon name="branch" size={15} /> {L("Nə olardı?", "What if?")}</NavLink>}
        </nav>
      </div>
      <Outlet context={ctx} />
    </>
  );
}

/** Routes under a portfolio (or a share link): today/*, forecast/*, compare; the old paths still lead somewhere. */
export function resultRoutes(whatIf: boolean) {
  return (
    <>
      <Route path="today" element={<ViewLayout basis="today" whatIf={whatIf} />}>
        <Route index element={<Navigate to="investment" replace />} />
        <Route path="investment" element={<TodayInvestment />} />
        <Route path="risk" element={<TodayRisk />} />
        <Route path="recommendations" element={<RecommendationsPage basis="history" />} />
        {whatIf && <Route path="whatif" element={<WhatIfPage basis="history" />} />}
      </Route>
      <Route path="forecast" element={<ViewLayout basis="forecast" whatIf={whatIf} />}>
        <Route index element={<Navigate to="investment" replace />} />
        <Route path="investment" element={<InvestmentView />} />
        <Route path="risk" element={<RiskView />} />
        <Route path="recommendations" element={<RecommendationsPage />} />
        {whatIf && <Route path="whatif" element={<WhatIfPage />} />}
      </Route>
      <Route path="compare" element={<ValuationView />} />
      <Route path="results" element={<Navigate to="../forecast/investment" replace />} />
      <Route path="risk" element={<Navigate to="../forecast/risk" replace />} />
      <Route path="recommendations" element={<Navigate to="../forecast/recommendations" replace />} />
      <Route path="whatif" element={<Navigate to="../forecast/whatif" replace />} />
      <Route path="valuation" element={<Navigate to="../compare" replace />} />
    </>
  );
}

/** The top-level tabs shared by a portfolio page and a share link. */
export function ResultTabs({ base }: { base: string }) {
  return (
    <>
      <NavLink to={`${base}/today`}><Icon name="list" size={16} /> {L("Bu gün", "Today")}</NavLink>
      <NavLink to={`${base}/forecast`}><Icon name="chart" size={16} /> {L("Proqnoz", "Forecast")}</NavLink>
      <NavLink to={`${base}/compare`}><Icon name="scale" size={16} /> {L("Müqayisə", "Compare")}</NavLink>
    </>
  );
}
