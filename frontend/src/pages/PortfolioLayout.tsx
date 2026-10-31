import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api, apiUrl, DEMO, PortfolioSummary, RunView } from "../api";
import { useApp } from "../App";
import { ReliabilityBadge } from "../components/Badges";
import { Icon } from "../components/Icons";
import { dateTimeAz, pct } from "../format";
import { Key, STEP_ORDER, t } from "../i18n";

export interface PortfolioOutlet {
  summary: PortfolioSummary;
  /** Latest run of this portfolio (full result once done); polled here so every tab sees the same run. */
  run: RunView | null;
  runLoaded: boolean;
}

export const usePortfolio = () => useOutletContext<PortfolioOutlet>();

export default function PortfolioLayout() {
  const { id } = useParams();
  const pid = Number(id);
  const { portfolios, reloadPortfolios, config } = useApp();
  const summary = portfolios?.find((p) => p.id === pid);
  const [run, setRun] = useState<RunView | null>(null);
  const [runLoaded, setRunLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const timer = useRef<number | null>(null);
  const startedHere = useRef(false);
  const prevStatus = useRef<string | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const nav = useNavigate();

  const poll = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    const r = await api.get<RunView | null>(`/api/portfolios/${pid}/runs/latest`).catch(() => null);
    // keep the same result object while nothing changed, so charts are not rebuilt on every poll; a finished
    // validation may have recomputed the run (fallback specification), so that poll takes the new result
    setRun((prev) =>
      prev && r && prev.id === r.id && prev.result && r.result && prev.validation_status === r.validation_status
        ? { ...r, result: prev.result }
        : r,
    );
    setRunLoaded(true);
    const was = prevStatus.current;
    prevStatus.current = r?.status ?? null;
    if (r && r.status !== was && (r.status === "done" || r.status === "failed") && (was === "running" || was === "queued")) {
      reloadPortfolios();
    }
    if (r && r.status === "done" && startedHere.current) {
      startedHere.current = false;
      nav(`/portfolios/${pid}/results`);
    }
    if (r && (r.status === "queued" || r.status === "running")) {
      timer.current = window.setTimeout(poll, 1200);
    } else if (r && r.status === "done" && r.validation_status !== "done" && r.validation_status !== "failed") {
      timer.current = window.setTimeout(poll, 5000);
    }
  }, [pid, nav, reloadPortfolios]);

  useEffect(() => {
    setRunLoaded(false);
    setRun(null);
    prevStatus.current = null;
    setRenaming(false);
    setError(null);
  }, [pid]);

  useEffect(() => {
    poll();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [poll, summary?.version]);

  if (portfolios === null) return <div className="muted">Yüklənir…</div>;
  if (!summary) {
    return (
      <div className="card empty">
        <h2>Portfel tapılmadı</h2>
        <p className="muted">Silinmiş ola bilər.</p>
        <Link to="/">Portfellərimə qayıt</Link>
      </div>
    );
  }

  async function generate() {
    setError(null);
    try {
      const r = await api.post<RunView>(`/api/portfolios/${pid}/generate`);
      startedHere.current = true;
      prevStatus.current = r.status;
      setRun(r);
      reloadPortfolios();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(poll, 800);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await api.patch(`/api/portfolios/${pid}`, { name: newName.trim() });
      setRenaming(false);
      reloadPortfolios();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function copy() {
    menuRef.current?.removeAttribute("open");
    try {
      const q = await api.post<PortfolioSummary>(`/api/portfolios/${pid}/copy`);
      await reloadPortfolios();
      nav(`/portfolios/${q.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove() {
    menuRef.current?.removeAttribute("open");
    if (!confirm(`"${summary!.name}" portfeli və bütün nəticələri silinsin? Bu geri qaytarıla bilməz.`)) return;
    try {
      await api.del(`/api/portfolios/${pid}`);
      await reloadPortfolios();
      nav("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const busy = !!run && (run.status === "queued" || run.status === "running");
  const curIdx = run ? STEP_ORDER.indexOf(run.step as (typeof STEP_ORDER)[number]) : -1;
  const limit = summary.risk_limit ?? config?.risk_profiles[summary.risk_profile];
  const empty = summary.n_instruments === 0;

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Portfel</div>
          {renaming ? (
            <form onSubmit={rename} className="row-actions" style={{ marginTop: 4 }}>
              <input autoFocus value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} aria-label={t("rename")} style={{ fontSize: 18, minWidth: 260 }} />
              <button className="primary" type="submit" disabled={!newName.trim()}>{t("save")}</button>
              <button type="button" onClick={() => setRenaming(false)}>{t("cancel")}</button>
            </form>
          ) : (
            <h1>{summary.name}</h1>
          )}
          <div className="chips">
            <span>{summary.base_currency}</span>
            <span>{t(summary.risk_profile as Key)} profil{limit != null ? ` · limit ${pct(limit)}` : ""}</span>
            <span>{summary.n_instruments} səhm</span>
            <span>{t("lastGenerate")}: {run?.created_at ? dateTimeAz(run.created_at) : t("never")}</span>
            {run?.status === "done" && <ReliabilityBadge level={run.reliability} />}
          </div>
        </div>
        <div className="row-actions">
          <button className="primary" onClick={generate} disabled={busy || empty}
            title={empty ? "Əvvəlcə ən azı bir səhm əlavə edin" : "3 aylıq təhlili hesabla"}>
            <Icon name="play" size={15} /> {t("generate")}
          </button>
          {summary.headline ? (
            <a className="btn" href={DEMO ? `${import.meta.env.BASE_URL}demo/report.pdf` : apiUrl(`/api/portfolios/${pid}/report.pdf`)} download
              title="Son nəticənin hesabatı: investisiya, risk, mövqelər, alışlar və tövsiyələr">
              <Icon name="download" size={16} /> PDF yüklə
            </a>
          ) : (
            <button disabled title="Hesabat üçün əvvəlcə Generate basın"><Icon name="download" size={16} /> PDF yüklə</button>
          )}
          <details className="menu" ref={menuRef}>
            <summary className="btn" aria-label="Portfel əməliyyatları"><Icon name="more" /></summary>
            <div className="menu-list">
              <button onClick={() => { menuRef.current?.removeAttribute("open"); setNewName(summary.name); setRenaming(true); }}>{t("rename")}</button>
              <button onClick={copy}>{t("copy")}</button>
              <button className="danger" onClick={remove}>{t("delete")}</button>
            </div>
          </details>
        </div>
      </div>

      {error && <div className="banner err" role="alert">✕ {error}</div>}
      <div aria-live="polite">
        {busy && run && (
          <section className="card run-panel">
            <div className="card-head" style={{ marginBottom: 8 }}>
              <div>
                <h2>Təhlil hesablanır…</h2>
                <div className="sub">3 aylıq (63 ticarət günü) ehtimal proqnozu, risk və tövsiyələr. Adətən 1–3 dəqiqə çəkir; bu səhifədən çıxmaq olar.</div>
              </div>
              <span className="small muted">{Math.round(run.progress * 100)}%</span>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(run.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.max(5, run.progress * 100)}%` }} />
            </div>
            <div className="steps">
              {STEP_ORDER.map((s, i) => (
                <span key={s} className={i < curIdx ? "done" : i === curIdx ? "cur" : ""}>
                  {i < curIdx ? "✓ " : i === curIdx ? "▸ " : ""}
                  {t(`steps_${s}` as Key)}
                </span>
              ))}
            </div>
          </section>
        )}
        {run?.status === "failed" && <div className="banner err" role="alert">✕ Son təhlil alınmadı: {run.error}</div>}
        {run?.status === "done" && run.stale && (
          <div className="banner warn" role="status"><span className="ic">⚠</span> {t("staleBanner")}</div>
        )}
      </div>

      <nav className="tabs" aria-label="Portfel bölmələri">
        <NavLink to={`/portfolios/${pid}`} end><Icon name="list" size={16} /> Tərkib</NavLink>
        <NavLink to={`/portfolios/${pid}/results`}><Icon name="chart" size={16} /> İnvestisiya</NavLink>
        <NavLink to={`/portfolios/${pid}/risk`}><Icon name="shield" size={16} /> Risk</NavLink>
        <NavLink to={`/portfolios/${pid}/recommendations`}><Icon name="bulb" size={16} /> {t("recommendations")}</NavLink>
      </nav>

      <Outlet context={{ summary, run, runLoaded } satisfies PortfolioOutlet} />
    </>
  );
}

/** Shown on the results/recommendations tabs when there is no finished run to show. */
export function NoResults({ run, runLoaded }: { run: RunView | null; runLoaded: boolean }) {
  if (!runLoaded) return <div className="muted">Yüklənir…</div>;
  const busy = run && (run.status === "queued" || run.status === "running");
  return (
    <div className="card empty">
      <h2>{busy ? "Təhlil hesablanır" : "Hələ nəticə yoxdur"}</h2>
      <p className="muted">
        {busy
          ? "Hazır olanda nəticələr burada avtomatik görünəcək."
          : "Səhmləri “Tərkib” bölməsində əlavə edin və yuxarıdakı Generate düyməsini basın."}
      </p>
    </div>
  );
}
