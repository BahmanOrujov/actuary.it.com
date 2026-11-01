import { FormEvent, useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useParams } from "react-router-dom";
import { api, apiUrl } from "../api";
import { ReliabilityBadge, StatusBadge } from "../components/Badges";
import { dateAz, dateTimeAz } from "../format";
import { L } from "../lang";

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
      <h2>{L("Bütün run-lar", "All runs")}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>{L("Portfel", "Portfolio")}</th><th>{L("Müştəri", "Client")}</th><th>{L("Tarix", "Date")}</th><th>{L("Məlumat", "Data")}</th><th>{L("Vəziyyət", "Status")}</th><th>{L("Validasiya", "Validation")}</th><th>{L("Gate-lər", "Gates")}</th><th>{L("Etibarlılıq", "Reliability")}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><NavLink to={`/admin/runs/${r.id}`}>{r.id}</NavLink></td>
                <td>{r.portfolio} {r.stale && <span className="badge warn">{L("köhnəlib", "outdated")}</span>}</td>
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
  if (!d) return <div className="muted">{L("Yüklənir…", "Loading…")}</div>;
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Run {id}</h2>
          <div className="row-actions">
            <a href={apiUrl(`/api/admin/runs/${id}/report.html`)} target="_blank" rel="noreferrer">HTML hesabat</a>
            <a href={apiUrl(`/api/admin/runs/${id}/report.json`)}>{L("JSON yüklə", "Download JSON")}</a>
            <button onClick={async () => { await api.post(`/api/admin/runs/${id}/revalidate`); setMsg(L("Validasiya növbəyə əlavə olundu", "Validation queued")); load(); }}>
              {L("Yenidən validasiya", "Validate again")}
            </button>
          </div>
        </div>
        {msg && <p className="small">{msg}</p>}
        {d.validation?.gates ? (
          <table>
            <thead><tr><th>#</th><th>Gate</th><th>{L("Nəticə", "Result")}</th><th>{L("Qeyd", "Note")}</th></tr></thead>
            <tbody>
              {d.validation.gates.map((g) => (
                <tr key={g.id}>
                  <td>{g.id}</td><td>{g.name}</td>
                  <td>
                    {g.pass === null ? <span className="badge checking">• {L("müəyyən deyil", "undetermined")}</span> : <StatusBadge status={g.pass ? "pass" : "fail"} />}
                    {g.pass_after_conformal && <span className="badge warn">{L("conformal ilə", "with conformal")}</span>}
                    {g.pass_unadjusted !== undefined && g.pass_unadjusted !== g.pass && <span className="small muted"> {L("düzəlişsiz", "unadjusted")}: {g.pass_unadjusted ? L("keçdi", "passed") : L("keçmədi", "failed")}</span>}
                  </td>
                  <td className="small">{g.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{L("Validasiya hələ bitməyib.", "Validation has not finished yet.")}</p>
        )}
      </section>
      <section className="card">
        <h2>{L("Tam hesabat", "Full report")}</h2>
        <iframe title={L("Admin hesabatı", "Admin report")} src={apiUrl(`/api/admin/runs/${id}/report.html`)} style={{ width: "100%", height: "70vh", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
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
      <h2>{L("Xəbərdarlıqlar", "Alerts")}</h2>
      {rows.length === 0 && <p className="muted">{L("Açıq xəbərdarlıq yoxdur.", "No open alerts.")}</p>}
      {rows.map((a) => (
        <div key={a.id} className={`banner ${a.level === "error" ? "err" : "warn"}`}>
          <span>{a.level === "error" ? "✕" : "⚠"}</span>
          <div style={{ flex: 1 }}>
            <div>{a.message}</div>
            <div className="small muted">{dateTimeAz(a.created_at)} · {a.kind} {a.run_id && <NavLink to={`/admin/runs/${a.run_id}`}>run {a.run_id}</NavLink>}</div>
          </div>
          <button onClick={async () => { await api.post(`/api/admin/alerts/${a.id}/resolve`); load(); }}>{L("Həll olundu", "Resolved")}</button>
        </div>
      ))}
    </section>
  );
}

const SETTING_LABEL: Record<string, string> = {
  "rf.USD": L("rf USD (boş = ^IRX)", "rf USD (empty = ^IRX)"), "rf.EUR": "rf EUR", "rf.GBP": "rf GBP", "rf.AZN": "rf AZN",
  "mrp.USD": "MRP USD", "mrp.EUR": "MRP EUR", "mrp.GBP": "MRP GBP", "mrp.AZN": "MRP AZN",
  "profile.conservative": L("Konservativ limit", "Conservative limit"), "profile.moderate": L("Mötədil limit", "Moderate limit"), "profile.aggressive": L("Aqressiv limit", "Aggressive limit"),
  "gate.alpha": L("Gate əhəmiyyətlilik səviyyəsi", "Gate significance level"), "feature.csv_import": L("CSV idxalı", "CSV import"), "feature.signal_model": L("Siqnal modeli (Mərhələ B)", "Signal model (stage B)"),
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
      setMsg(`✓ ${SETTING_LABEL[key] ?? key} ${L("yadda saxlanıldı", "saved")}`);
      load();
    } catch (err) {
      setMsg(`✕ ${(err as Error).message}`);
    }
  }
  return (
    <section className="card">
      <h2>{L("Parametrlər", "Settings")}</h2>
      <p className="muted small">{L("Rejim", "Mode")}: <b>{s.mode}</b>. {L("Faizlər onluq kəsr kimi daxil edilir (0.04 = 4%). Dəyişikliklər növbəti Generate-də tətbiq olunur.", "Percentages are entered as decimals (0.04 = 4%). Changes apply from the next Generate.")}</p>
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
                    <button type="submit">{L("Saxla", "Save")}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{L("Siqnal modeli və RL validasiya gate-lərindən keçməyənə qədər söndürülü qalır.", "The signal model and RL stay disabled until they pass the validation gates.")}</p>
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("client");
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  async function invite(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await api.post<{ emailed: boolean; link?: string }>("/api/admin/users/invite", { email: inviteEmail, role: inviteRole });
      setInviteMsg(r.emailed
        ? { ok: true, text: L(`Dəvət ${inviteEmail} ünvanına göndərildi. İstifadəçi linkdən öz parolunu təyin edəcək.`, `The invitation was sent to ${inviteEmail}. The user will set their own password from the link.`) }
        : { ok: true, text: L("Hesab açıldı, amma serverdə e-poçt qurulmayıb. Bu linki istifadəçiyə özünüz göndərin:", "The account was created, but e-mail is not set up on the server. Send this link to the user yourself:"), link: r.link });
      setInviteEmail("");
      load();
    } catch (err) {
      setInviteMsg({ ok: false, text: (err as Error).message });
    }
  }
  return (
    <section className="card">
      <h2>{L("İstifadəçilər", "Users")}</h2>
      <form onSubmit={invite} className="row-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <input type="email" required placeholder={L("yeni.istifadeci@example.com", "new.user@example.com")} aria-label={L("Dəvət ediləcək e-poçt", "E-mail to invite")}
          value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} aria-label={L("Dəvət olunanın rolu", "Role of the invitee")}>
          <option value="client">client</option>
          <option value="admin">admin</option>
        </select>
        <button className="primary" type="submit">{L("Dəvət et", "Invite")}</button>
      </form>
      {inviteMsg && (
        <div className={`banner ${inviteMsg.ok ? "info" : "err"}`} role="status">
          {inviteMsg.ok ? "✓" : "✕"} {inviteMsg.text}
          {inviteMsg.link && <div><code style={{ wordBreak: "break-all" }}>{inviteMsg.link}</code></div>}
        </div>
      )}
      <table>
        <thead><tr><th>{L("E-poçt", "E-mail")}</th><th>{L("Rol", "Role")}</th><th className="num">{L("Portfel", "Portfolios")}</th><th>{L("Vəziyyət", "Status")}</th><th /></tr></thead>
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
                {u.is_blocked ? <span className="badge err">✕ {L("bloklanıb", "blocked")}</span> : <span className="badge ok">✓ {L("aktiv", "active")}</span>}
                {u.locked_until && <span className="badge warn" style={{ marginLeft: 6 }}>⚠ {L(`kilidli: ${dateTimeAz(u.locked_until)}-dək`, `locked until ${dateTimeAz(u.locked_until)}`)}</span>}
                {!u.locked_until && u.failed_logins > 0 && <span className="small muted"> · {L("uğursuz cəhd", "failed attempts")}: {u.failed_logins}</span>}
              </td>
              <td>
                <div className="row-actions">
                  <button onClick={() => patch(u.id, { is_blocked: !u.is_blocked })}>{u.is_blocked ? L("Blokdan çıxar", "Unblock") : L("Blokla", "Block")}</button>
                  {u.locked_until && <button onClick={() => patch(u.id, { unlock: true })}>{L("Kilidi aç", "Unlock")}</button>}
                  <button onClick={() => { const pw = prompt(L("Yeni parol (ən azı 10 simvol, yayılmış parol olmasın):", "New password (at least 10 characters, not a common password):")); if (pw) patch(u.id, { new_password: pw }); }}>{L("Parolu yenilə", "Reset password")}</button>
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
        <h2>{L("Məlumat provayderi", "Data provider")}</h2>
        <p>{L("Rejim", "Mode")}: {d.mode} · {L("Provayder", "Provider")}: {d.provider} · {L("Bu prosesdə sorğu sayı", "Requests in this process")}: {d.requests_this_process ?? "—"}</p>
        <table>
          <thead><tr><th>{L("Simvol", "Symbol")}</th><th>{L("Son yeniləmə", "Last update")}</th><th>{L("Vəziyyət", "Status")}</th><th className="num">{L("Sorğular", "Requests")}</th></tr></thead>
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
        <h2>{L("Fon işləri", "Background jobs")}</h2>
        <table>
          <thead><tr><th>#</th><th>{L("Növ", "Kind")}</th><th>Run</th><th>{L("Vəziyyət", "Status")}</th><th className="num">{L("Cəhd", "Attempts")}</th><th>{L("Xəta", "Error")}</th></tr></thead>
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
          <div className="eyebrow">{L("Yalnız admin", "Admins only")}</div>
          <h1>{L("Admin paneli", "Admin panel")}</h1>
          <div className="lead">{L("Run-lar, statistik validasiya, xəbərdarlıqlar, parametrlər və istifadəçilər.", "Runs, statistical validation, alerts, settings and users.")}</div>
        </div>
      </div>
      <nav className="tabs" aria-label={L("Admin menyu", "Admin menu")}>
        <NavLink to="/admin" end>{L("Run-lar", "Runs")}</NavLink>
        <NavLink to="/admin/alerts">{L("Xəbərdarlıqlar", "Alerts")}</NavLink>
        <NavLink to="/admin/settings">{L("Parametrlər", "Settings")}</NavLink>
        <NavLink to="/admin/users">{L("İstifadəçilər", "Users")}</NavLink>
        <NavLink to="/admin/provider">{L("Provayder", "Provider")}</NavLink>
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
