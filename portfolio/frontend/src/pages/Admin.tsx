import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useParams } from "react-router-dom";
import { api } from "../api";
import { ReliabilityBadge, StatusBadge } from "../components/Badges";
import { dateAz, dateTimeAz } from "../format";

interface RunRow {
  id: number;
  portfolio_id: number;
  portfolio: string;
  owner: string;
  created_at: string;
  status: string;
  validation_status: string;
  gate_verdict: string | null;
  reliability: string;
  error: string | null;
  data_as_of: string | null;
  stale: boolean;
}

function Runs() {
  const [rows, setRows] = useState<RunRow[]>([]);
  useEffect(() => {
    api.get<RunRow[]>("/api/admin/runs").then(setRows);
  }, []);
  return (
    <section className="card">
      <h2>Bütün run-lar</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Portfel</th><th>Müştəri</th><th>Tarix</th><th>Məlumat</th><th>Vəziyyət</th><th>Validasiya</th><th>Gate-lər</th><th>Etibarlılıq</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><NavLink to={`/admin/runs/${r.id}`}>{r.id}</NavLink></td>
                <td>{r.portfolio} {r.stale && <span className="badge warn">köhnəlib</span>}</td>
                <td>{r.owner}</td>
                <td>{dateTimeAz(r.created_at)}</td>
                <td>{dateAz(r.data_as_of)}</td>
                <td><StatusBadge status={r.status} />{r.error && <div className="small" style={{ color: "var(--err)" }}>{r.error}</div>}</td>
                <td><StatusBadge status={r.validation_status} /></td>
                <td>{r.gate_verdict ? <StatusBadge status={r.gate_verdict} /> : "—"}</td>
                <td><ReliabilityBadge level={r.reliability} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface Gate { id: number; name: string; pass: boolean | null; note?: string; pass_after_conformal?: boolean; pass_unadjusted?: boolean }

function RunDetail() {
  const { id } = useParams();
  const [d, setD] = useState<{ run: Record<string, unknown>; diagnostics: Record<string, unknown> | null; validation: { gates?: Gate[]; verdict?: string } | null } | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api.get<typeof d>(`/api/admin/runs/${id}`).then(setD), [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <div className="muted">Yüklənir…</div>;
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Run {id}</h2>
          <div className="row-actions">
            <a href={`/api/admin/runs/${id}/report.html`} target="_blank" rel="noreferrer">HTML hesabat</a>
            <a href={`/api/admin/runs/${id}/report.json`}>JSON yüklə</a>
            <button onClick={async () => { await api.post(`/api/admin/runs/${id}/revalidate`); setMsg("Validasiya növbəyə əlavə olundu"); load(); }}>
              Yenidən validasiya
            </button>
          </div>
        </div>
        {msg && <p className="small">{msg}</p>}
        {d.validation?.gates ? (
          <table>
            <thead><tr><th>#</th><th>Gate</th><th>Nəticə</th><th>Qeyd</th></tr></thead>
            <tbody>
              {d.validation.gates.map((g) => (
                <tr key={g.id}>
                  <td>{g.id}</td><td>{g.name}</td>
                  <td>
                    {g.pass === null ? <span className="badge checking">• müəyyən deyil</span> : <StatusBadge status={g.pass ? "pass" : "fail"} />}
                    {g.pass_after_conformal && <span className="badge warn">conformal ilə</span>}
                    {g.pass_unadjusted !== undefined && g.pass_unadjusted !== g.pass && <span className="small muted"> düzəlişsiz: {g.pass_unadjusted ? "keçdi" : "keçmədi"}</span>}
                  </td>
                  <td className="small">{g.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Validasiya hələ bitməyib.</p>
        )}
      </section>
      <section className="card">
        <h2>Tam hesabat</h2>
        <iframe title="Admin hesabatı" src={`/api/admin/runs/${id}/report.html`} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
      </section>
    </>
  );
}

function Alerts() {
  const [rows, setRows] = useState<{ id: number; level: string; kind: string; message: string; created_at: string; run_id: number | null }[]>([]);
  const load = () => api.get<typeof rows>("/api/admin/alerts").then(setRows);
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="card">
      <h2>Xəbərdarlıqlar</h2>
      {rows.length === 0 && <p className="muted">Açıq xəbərdarlıq yoxdur.</p>}
      {rows.map((a) => (
        <div key={a.id} className={`banner ${a.level === "error" ? "err" : "warn"}`}>
          <span>{a.level === "error" ? "✕" : "⚠"}</span>
          <div style={{ flex: 1 }}>
            <div>{a.message}</div>
            <div className="small muted">{dateTimeAz(a.created_at)} · {a.kind} {a.run_id && <NavLink to={`/admin/runs/${a.run_id}`}>run {a.run_id}</NavLink>}</div>
          </div>
          <button onClick={async () => { await api.post(`/api/admin/alerts/${a.id}/resolve`); load(); }}>Həll olundu</button>
        </div>
      ))}
    </section>
  );
}

const SETTING_LABEL: Record<string, string> = {
  "rf.USD": "rf USD (boş = ^IRX)", "rf.EUR": "rf EUR", "rf.GBP": "rf GBP", "rf.AZN": "rf AZN",
  "mrp.USD": "MRP USD", "mrp.EUR": "MRP EUR", "mrp.GBP": "MRP GBP", "mrp.AZN": "MRP AZN",
  "profile.conservative": "Konservativ limit", "profile.moderate": "Mötədil limit", "profile.aggressive": "Aqressiv limit",
  "gate.alpha": "Gate əhəmiyyətlilik səviyyəsi", "feature.csv_import": "CSV idxalı", "feature.signal_model": "Siqnal modeli (Mərhələ B)",
};

function Settings() {
  const [s, setS] = useState<{ effective: Record<string, unknown>; editable: string[]; mode: string } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => api.get<typeof s>("/api/admin/settings").then(setS);
  useEffect(() => {
    load();
  }, []);
  if (!s) return null;
  async function save(key: string, value: unknown) {
    try {
      await api.put("/api/admin/settings", { key, value });
      setMsg(`✓ ${SETTING_LABEL[key] ?? key} yadda saxlanıldı`);
      load();
    } catch (err) {
      setMsg(`✕ ${(err as Error).message}`);
    }
  }
  return (
    <section className="card">
      <h2>Parametrlər</h2>
      <p className="muted small">Rejim: <b>{s.mode}</b>. Faizlər onluq kəsr kimi daxil edilir (0.04 = 4%). Dəyişikliklər növbəti Generate-də tətbiq olunur.</p>
      {msg && <p className="small">{msg}</p>}
      <table>
        <tbody>
          {s.editable.map((k) => (
            <tr key={k}>
              <td>{SETTING_LABEL[k] ?? k}</td>
              <td>
                {k.startsWith("feature.") ? (
                  <input type="checkbox" checked={!!s.effective[k]} onChange={(e) => save(k, e.target.checked)}
                    disabled={k === "feature.signal_model" || (k === "feature.csv_import" && s.mode === "commercial")} />
                ) : (
                  <form className="row-actions" onSubmit={(e) => {
                    e.preventDefault();
                    const v = String(new FormData(e.currentTarget).get("v") ?? "").replace(",", ".");
                    save(k, v === "" ? null : Number(v));
                  }}>
                    <input name="v" defaultValue={s.effective[k] == null ? "" : String(s.effective[k])} style={{ width: 110 }} aria-label={k} />
                    <button type="submit">Saxla</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Siqnal modeli və RL validasiya gate-lərindən keçməyənə qədər söndürülü qalır.</p>
    </section>
  );
}

function Users() {
  const [rows, setRows] = useState<{ id: number; email: string; role: string; is_blocked: boolean; portfolios: number; locked_until: string | null; failed_logins: number }[]>([]);
  const load = () => api.get<typeof rows>("/api/admin/users").then(setRows);
  useEffect(() => {
    load();
  }, []);
  async function patch(id: number, body: object) {
    try {
      await api.patch(`/api/admin/users/${id}`, body);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }
  return (
    <section className="card">
      <h2>İstifadəçilər</h2>
      <table>
        <thead><tr><th>E-poçt</th><th>Rol</th><th className="num">Portfel</th><th>Vəziyyət</th><th /></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} aria-label="Rol">
                  <option value="client">client</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="num">{u.portfolios}</td>
              <td>
                {u.is_blocked ? <span className="badge err">✕ bloklanıb</span> : <span className="badge ok">✓ aktiv</span>}
                {u.locked_until && <span className="badge warn" style={{ marginLeft: 6 }}>⚠ kilidli: {dateTimeAz(u.locked_until)}-dək</span>}
                {!u.locked_until && u.failed_logins > 0 && <span className="small muted"> · uğursuz cəhd: {u.failed_logins}</span>}
              </td>
              <td>
                <div className="row-actions">
                  <button onClick={() => patch(u.id, { is_blocked: !u.is_blocked })}>{u.is_blocked ? "Blokdan çıxar" : "Blokla"}</button>
                  {u.locked_until && <button onClick={() => patch(u.id, { unlock: true })}>Kilidi aç</button>}
                  <button onClick={() => { const pw = prompt("Yeni parol (ən azı 10 simvol, yayılmış parol olmasın):"); if (pw) patch(u.id, { new_password: pw }); }}>Parolu yenilə</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Provider() {
  const [d, setD] = useState<{ mode: string; provider: string; requests_this_process: number | null; symbols: { symbol: string; last_fetch_at: string; status: string; requests: number }[]; jobs: { id: number; kind: string; run_id: number; status: string; attempts: number; error: string }[] } | null>(null);
  useEffect(() => {
    api.get<typeof d>("/api/admin/provider-status").then(setD);
  }, []);
  if (!d) return null;
  return (
    <>
      <section className="card">
        <h2>Məlumat provayderi</h2>
        <p>Rejim: {d.mode} · Provayder: {d.provider} · Bu prosesdə sorğu sayı: {d.requests_this_process ?? "—"}</p>
        <table>
          <thead><tr><th>Simvol</th><th>Son yeniləmə</th><th>Vəziyyət</th><th className="num">Sorğular</th></tr></thead>
          <tbody>
            {d.symbols.map((s) => (
              <tr key={s.symbol}>
                <td>{s.symbol}</td><td>{dateTimeAz(s.last_fetch_at)}</td>
                <td>{s.status === "ok" ? <span className="badge ok">✓ ok</span> : <span className="badge err">✕ {s.status}</span>}</td>
                <td className="num">{s.requests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Fon işləri</h2>
        <table>
          <thead><tr><th>#</th><th>Növ</th><th>Run</th><th>Vəziyyət</th><th className="num">Cəhd</th><th>Xəta</th></tr></thead>
          <tbody>
            {d.jobs.map((j) => (
              <tr key={j.id}><td>{j.id}</td><td>{j.kind}</td><td>{j.run_id}</td><td><StatusBadge status={j.status} /></td><td className="num">{j.attempts}</td><td className="small">{j.error}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Yalnız admin</div>
          <h1>Admin paneli</h1>
          <div className="lead">Run-lar, statistik validasiya, xəbərdarlıqlar, parametrlər və istifadəçilər.</div>
        </div>
      </div>
      <nav className="tabs" aria-label="Admin menyu">
        <NavLink to="/admin" end>Run-lar</NavLink>
        <NavLink to="/admin/alerts">Xəbərdarlıqlar</NavLink>
        <NavLink to="/admin/settings">Parametrlər</NavLink>
        <NavLink to="/admin/users">İstifadəçilər</NavLink>
        <NavLink to="/admin/provider">Provayder</NavLink>
      </nav>
      <Routes>
        <Route index element={<Runs />} />
        <Route path="runs/:id" element={<RunDetail />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<Users />} />
        <Route path="provider" element={<Provider />} />
      </Routes>
    </>
  );
}
