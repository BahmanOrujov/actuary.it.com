import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, DEMO, PortfolioSummary, PublicConfig, User } from "./api";
import { Icon } from "./components/Icons";
import NewPortfolioDialog from "./components/NewPortfolioDialog";
import Sidebar from "./components/Sidebar";
import AdminPage from "./pages/Admin";
import LoginPage from "./pages/Login";
import NotificationsPage from "./pages/Notifications";
import PortfolioEditor from "./pages/PortfolioEditor";
import PortfolioLayout from "./pages/PortfolioLayout";
import PortfoliosPage from "./pages/Portfolios";
import RecommendationsPage from "./pages/Recommendations";
import { InvestmentView, RiskView, ValuationView } from "./pages/Results";
import ResetPage from "./pages/Reset";
import SettingsPage from "./pages/Settings";
import SharedLayout from "./pages/Shared";
import WhatIfPage from "./pages/WhatIf";
import { t } from "./i18n";
import { L } from "./lang";

interface Ctx {
  user: User | null;
  setUser: (u: User | null) => void;
  config: PublicConfig | null;
  /** All of the user's portfolios, shared by the sidebar, the overview and the portfolio pages. */
  portfolios: PortfolioSummary[] | null;
  reloadPortfolios: () => Promise<void>;
  openNewPortfolio: () => void;
  unread: number;
  refreshUnread: () => void;
}

const AppCtx = createContext<Ctx>({
  user: null, setUser: () => {}, config: null, portfolios: null, reloadPortfolios: async () => {},
  openNewPortfolio: () => {}, unread: 0, refreshUnread: () => {},
});
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [portfolios, setPortfolios] = useState<PortfolioSummary[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  const refreshUnread = useCallback(() => {
    api.get<{ unread: number }>("/api/notifications").then((r) => setUnread(r.unread)).catch(() => {});
  }, []);

  const reloadPortfolios = useCallback(async () => {
    try {
      setPortfolios(await api.get<PortfolioSummary[]>("/api/portfolios"));
    } catch {
      /* the page that needs the list shows its own error */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setPortfolios(null);
      return;
    }
    reloadPortfolios();
    refreshUnread();
    const h = window.setInterval(refreshUnread, 60_000);
    return () => window.clearInterval(h);
  }, [user, refreshUnread, reloadPortfolios]);

  useEffect(() => {
    api.get<PublicConfig>("/api/config/public").then(setConfig).catch(() => {});
    api
      .get<User>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // the mobile drawer closes and the page starts at the top after every navigation
  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // a share link opens the same way whether or not the visitor is signed in, without the app shell
  if (location.pathname.startsWith("/shared/")) {
    return (
      <Routes>
        <Route path="/shared/:token" element={<SharedLayout />}>
          <Route index element={<Navigate to="results" replace />} />
          <Route path="valuation" element={<ValuationView />} />
          <Route path="results" element={<InvestmentView />} />
          <Route path="risk" element={<RiskView />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
        </Route>
      </Routes>
    );
  }

  if (loading) return <div className="page muted">{L("Yüklənir…", "Loading…")}</div>;

  const ctx: Ctx = {
    user, setUser, config, portfolios, reloadPortfolios, openNewPortfolio: () => setNewOpen(true), unread, refreshUnread,
  };

  if (!user) {
    return (
      <AppCtx.Provider value={ctx}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </AppCtx.Provider>
    );
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className={`shell${navOpen ? " nav-open" : ""}`}>
        <Sidebar />
        <div className="scrim" onClick={() => setNavOpen(false)} />
        <div className="main">
          <div className="mobilebar">
            <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label={L("Menyunu aç", "Open the menu")} aria-expanded={navOpen}>
              <Icon name="menu" size={22} />
            </button>
            <span className="title">{config?.brand ?? t("brand")}</span>
            <button className="icon-btn" onClick={() => setNewOpen(true)} aria-label={t("newPortfolio")}>
              <Icon name="plus" size={20} />
            </button>
          </div>
          <main className="page">
            {DEMO && (
              <div className="banner info demo-banner">
                <span className="ic">ℹ</span>
                <span><b>Demo.</b> {L("Nümunə portfelin hazır nəticələri göstərilir; dəyişiklik və yeni hesablama yoxdur. Tam versiya (öz portfelləriniz, Generate, PDF) kompüterdə lokal işləyir.",
                  "The ready results of a sample portfolio are shown; no changes or new analyses. The full version (your own portfolios, Generate, PDF) runs on your computer.")}</span>
              </div>
            )}
            <Routes>
              <Route path="/login" element={<Navigate to="/" />} />
              <Route path="/reset" element={<ResetPage />} />
              <Route path="/" element={<PortfoliosPage />} />
              <Route path="/portfolios/:id" element={<PortfolioLayout />}>
                <Route index element={<PortfolioEditor />} />
                <Route path="valuation" element={<ValuationView />} />
                <Route path="results" element={<InvestmentView />} />
                <Route path="risk" element={<RiskView />} />
                <Route path="recommendations" element={<RecommendationsPage />} />
                <Route path="whatif" element={<WhatIfPage />} />
              </Route>
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage onChange={refreshUnread} />} />
              {user.role === "admin" && <Route path="/admin/*" element={<AdminPage />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
      <NewPortfolioDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </AppCtx.Provider>
  );
}
