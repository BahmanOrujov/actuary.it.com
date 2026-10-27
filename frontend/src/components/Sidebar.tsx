import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { t } from "../i18n";
import { portfolioState } from "./Badges";
import { Icon } from "./Icons";

type Theme = "auto" | "dark" | "light";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>((document.documentElement.dataset.theme as Theme) ?? "auto");
  const next: Theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  const label = { auto: "Tema: avtomatik", dark: "Tema: tünd", light: "Tema: açıq" }[theme];
  return (
    <button
      className="sb-link ghost"
      style={{ justifyContent: "flex-start", border: "none" }}
      title="Temanı dəyiş"
      onClick={() => {
        if (next === "auto") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("pa_theme", next);
        } catch {
          /* storage unavailable */
        }
        setTheme(next);
      }}
    >
      <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "contrast"} /> {label}
    </button>
  );
}

export default function Sidebar() {
  const { user, setUser, config, portfolios, openNewPortfolio, unread } = useApp();
  const nav = useNavigate();
  if (!user) return null;

  return (
    <aside className="sidebar" aria-label="Yan menyu">
      <NavLink to="/" className="sb-brand">
        <span className="logo" aria-hidden="true">PA</span>
        {config?.brand ?? t("brand")}
      </NavLink>

      <NavLink to="/" end className="sb-link">
        <Icon name="home" /> Ümumi baxış
      </NavLink>

      <div className="sb-section">
        <span id="sb-portfolios">Portfellərim</span>
        <button className="icon-btn" onClick={openNewPortfolio} aria-label={t("newPortfolio")} title={t("newPortfolio")}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      <nav className="sb-list" aria-labelledby="sb-portfolios">
        {portfolios === null && <div className="sb-empty">Yüklənir…</div>}
        {portfolios?.length === 0 && <div className="sb-empty">Hələ portfel yoxdur.</div>}
        {portfolios?.map((p) => {
          const st = portfolioState(p);
          return (
            <NavLink key={p.id} to={`/portfolios/${p.id}`} className="sb-item" title={`${p.name} — ${st.label}`}>
              <span className={`dot ${st.cls}`} aria-hidden="true" />
              <span className="sb-name">{p.name}</span>
              <span className="sr-only">({st.label})</span>
              <span className="sb-meta">{p.base_currency}</span>
            </NavLink>
          );
        })}
      </nav>
      <button className="sb-new" onClick={openNewPortfolio}>
        <Icon name="plus" size={16} /> {t("newPortfolio")}
      </button>

      <div className="sb-foot">
        <NavLink to="/notifications" className="sb-link" aria-label={`${t("notifications")}: ${unread} oxunmamış`}>
          <Icon name="bell" /> {t("notifications")}
          {unread > 0 && <span className="count">{unread}</span>}
        </NavLink>
        <NavLink to="/settings" className="sb-link">
          <Icon name="settings" /> {t("settings")}
        </NavLink>
        {user.role === "admin" && (
          <NavLink to="/admin" className="sb-link">
            <Icon name="shield" /> {t("admin")}
          </NavLink>
        )}
        <ThemeToggle />
        <div className="sb-user">
          <span className="avatar" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span>
          <div className="who small">
            <div>{user.email}</div>
            <div className="muted">{user.role === "admin" ? "admin" : "müştəri"}</div>
          </div>
          <button
            className="icon-btn"
            aria-label={t("logout")}
            title={t("logout")}
            onClick={async () => {
              await api.post("/api/auth/logout").catch(() => {});
              setUser(null);
              nav("/login");
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </aside>
  );
}
