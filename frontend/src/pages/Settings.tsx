import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { dateTimeAz, pct } from "../format";
import { Key, t } from "../i18n";
import { L } from "../lang";

export default function SettingsPage() {
  const { user, setUser, config } = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();

  async function changePw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/api/auth/password", { old_password: fd.get("old"), new_password: fd.get("new") });
      setMsg(L("✓ Parol dəyişdirildi. Digər cihazlardakı sessiyalar bağlandı.", "✓ Password changed. Sessions on other devices were signed out."));
      e.currentTarget.reset();
    } catch (err) {
      setMsg(`✕ ${(err as Error).message}`);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("settings")}</h1>
          <div className="lead">{L("Hesab və təhlükəsizlik. Portfelin valyutası və risk limiti hər portfelin “Tərkib” bölməsində dəyişdirilir.", "Account and security. A portfolio's currency and risk limit are changed in its “Holdings” section.")}</div>
        </div>
      </div>
      <section className="card">
        <h2>{L("Hesab", "Account")}</h2>
        <p className="muted">{user?.email} · {L("rol", "role")}: {user?.role === "admin" ? "admin" : L("müştəri", "client")}</p>
        <form className="form-row" onSubmit={changePw}>
          <label>{L("Köhnə parol", "Current password")}<input name="old" type="password" required autoComplete="current-password" /></label>
          <label>{L("Yeni parol (ən azı 10 simvol; yayılmış parollar, ardıcıllıqlar və e-poçt adı qəbul olunmur)", "New password (at least 10 characters; common passwords, sequences and your e-mail name are not accepted)")}<input name="new" type="password" required minLength={10} autoComplete="new-password" /></label>
          <button type="submit">{L("Parolu dəyiş", "Change the password")}</button>
        </form>
        {msg && <p className="small">{msg}</p>}
      </section>
      <TwoFactor />
      <section className="card">
        <h2>{L("Dəstək üçün giriş icazəsi", "Support access")}</h2>
        <p className="muted">
          {L("Administratorlar portfellərinizin tərkibini, saylarını və əməliyyatlarınızı görmür. Kömək lazım olanda müvəqqəti icazə verə bilərsiniz: bu müddətdə admin portfellərinizə yalnız baxa bilər, heç nəyi dəyişə bilməz. Hər baxış qeydə alınır və sizə bildiriş gəlir. İcazə avtomatik bitir, istədiyiniz vaxt dayandıra bilərsiniz.",
            "Administrators do not see your holdings, quantities or transactions. When you need help, you can grant temporary access: during it an admin can only view your portfolios, not change anything. Every view is logged and you get a notice. The access ends by itself, and you can end it at any time.")}
        </p>
        {user?.support_access_until ? (
          <div className="row-actions">
            <span className="badge warn">⚠ {L(`icazə aktivdir: ${dateTimeAz(user.support_access_until)}-dək`, `access is on until ${dateTimeAz(user.support_access_until)}`)}</span>
            <button className="danger" onClick={async () => { await api.del("/api/auth/support-access"); setUser(await api.get("/api/auth/me")); }}>
              {L("İcazəni dayandır", "End the access")}
            </button>
          </div>
        ) : (
          <button onClick={async () => { await api.post("/api/auth/support-access"); setUser(await api.get("/api/auth/me")); }}>
            {L("Müvəqqəti icazə ver", "Grant temporary access")}
          </button>
        )}
      </section>
      <section className="card">
        <h2>{L("Risk profilləri (default limitlər)", "Risk profiles (default limits)")}</h2>
        <p className="muted small">{L("Portfel üçün 3 ayda qəbul edilən maksimum itki (CVaR 95%). Hər portfeldə ayrıca dəyişmək olar.", "The largest loss accepted over 3 months (CVaR 95%). It can be changed in each portfolio.")}</p>
        <ul>
          {Object.entries(config?.risk_profiles ?? {}).map(([k, v]) => (
            <li key={k}>{t(k as Key)}: {pct(v)}</li>
          ))}
        </ul>
      </section>
      {config?.csv_import && (
        <section className="card">
          <h2>{t("csvImport")}</h2>
          <p className="disclaimer">{config.csv_notice}</p>
        </section>
      )}
      <section className="card">
        <h2>{L("Hesabı sil", "Delete the account")}</h2>
        <p className="muted small">{L("Hesab, bütün portfellər və nəticələr birdəfəlik silinəcək.", "The account, all portfolios and results will be deleted permanently.")}</p>
        <button
          className="danger"
          onClick={async () => {
            if (confirm(L("Hesabınız və bütün məlumatlarınız silinsin? Bu geri qaytarıla bilməz.", "Delete your account and all your data? This cannot be undone."))) {
              await api.del("/api/auth/account");
              setUser(null);
              nav("/login");
            }
          }}
        >
          {L("Hesabı sil", "Delete the account")}
        </button>
      </section>
    </>
  );
}

/** Two-factor sign-in: QR code for an authenticator app, a first code to confirm, recovery codes shown once. */
function TwoFactor() {
  const { setUser } = useApp();
  const [st, setSt] = useState<{ enabled: boolean; recovery_codes_left: number; required: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr_svg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.get<typeof st>("/api/auth/2fa").then(setSt);
  useEffect(() => {
    load();
  }, []);

  async function run(f: () => Promise<void>) {
    setMsg(null);
    try {
      await f();
    } catch (err) {
      setMsg(`✕ ${(err as Error).message}`);
    }
  }
  const qrUrl = setup ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr_svg)}` : "";

  if (!st) return null;
  return (
    <section className="card">
      <h2>{L("İki mərhələli giriş (2FA)", "Two-factor sign-in (2FA)")} {st.enabled ? <span className="badge ok">✓ {L("aktiv", "on")}</span> : <span className="badge warn">{L("aktiv deyil", "off")}</span>}</h2>
      <p className="muted">
        {L("Girişdə paroldan əlavə telefonunuzdakı autentifikator tətbiqinin (Google Authenticator, Microsoft Authenticator, 1Password və s.) 30 saniyəlik kodu soruşulur. Parol oğurlansa belə, hesaba girmək olmur.",
          "Signing in asks, besides the password, for the 30-second code of an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, etc.). Even a stolen password is not enough.")}
        {st.required && !st.enabled && <b> {L("Admin hesabı üçün məcburidir: aktivləşdirənə qədər admin bölməsi bağlıdır.", "Required for admin accounts: the admin section stays closed until it is on.")}</b>}
      </p>
      {msg && <div className="banner err" role="alert">{msg}</div>}
      {codes && (
        <div className="banner warn" role="status">
          <div>
            <b>{L("Bərpa kodları — indi saxlayın, bir daha göstərilməyəcək.", "Recovery codes — save them now, they will not be shown again.")}</b>{" "}
            {L("Telefon itsə, hər biri ilə bir dəfə daxil ola bilərsiniz.", "If you lose your phone, each one signs you in once.")}
            <pre style={{ margin: "8px 0", fontSize: 15 }}>{codes.join("\n")}</pre>
            <button onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>{t("copy")}</button>{" "}
            <button onClick={() => setCodes(null)}>{L("Saxladım", "I saved them")}</button>
          </div>
        </div>
      )}
      {!st.enabled && !setup && (
        <form className="form-row" onSubmit={(e) => { e.preventDefault(); run(async () => { setSetup(await api.post("/api/auth/2fa/setup", { password: pw })); setPw(""); }); }}>
          <label>{L("Parolunuz (təsdiq üçün)", "Your password (to confirm)")}<input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <button className="primary" type="submit">{L("Aktivləşdir", "Turn on")}</button>
        </form>
      )}
      {!st.enabled && setup && (
        <div className="grid" style={{ gap: 10 }}>
          <p className="small">{L("1. Tətbiqdə “+” → “QR kodu skan et” seçin və bu kodu skan edin:", "1. In the app choose “+” → “Scan a QR code” and scan this code:")}</p>
          <img src={qrUrl} alt={L("2FA üçün QR kod", "QR code for 2FA")} style={{ width: 200, height: 200, background: "#fff", padding: 6, borderRadius: 8 }} />
          <p className="small muted">{L("Skan alınmırsa, açarı əl ilə daxil edin:", "If scanning fails, enter the key by hand:")} <code style={{ wordBreak: "break-all" }}>{setup.secret}</code></p>
          <form className="form-row" onSubmit={(e) => { e.preventDefault(); run(async () => {
            const r = await api.post<{ recovery_codes: string[] }>("/api/auth/2fa/enable", { code });
            setCodes(r.recovery_codes); setSetup(null); setCode(""); await load(); setUser(await api.get("/api/auth/me"));
          }); }}>
            <label>{L("2. Tətbiqdəki 6 rəqəmli kod", "2. The 6-digit code from the app")}<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <button className="primary" type="submit">{L("Təsdiqlə və aktivləşdir", "Confirm and turn on")}</button>
            <button type="button" onClick={() => setSetup(null)}>{t("cancel")}</button>
          </form>
        </div>
      )}
      {st.enabled && (
        <>
          <p className="small">{L(`Qalan bərpa kodları: ${st.recovery_codes_left}.`, `Recovery codes left: ${st.recovery_codes_left}.`)}</p>
          <form className="form-row" onSubmit={(e) => { e.preventDefault(); run(async () => {
            const r = await api.post<{ recovery_codes: string[] }>("/api/auth/2fa/recovery-codes", { code });
            setCodes(r.recovery_codes); setCode(""); await load();
          }); }}>
            <label>{L("Tətbiqdəki kod", "Code from the app")}<input required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <button type="submit">{L("Yeni bərpa kodları", "New recovery codes")}</button>
            {!st.required && (
              <button type="button" className="danger" onClick={() => {
                const p = prompt(L("Söndürmək üçün parolunuz:", "Your password to turn it off:"));
                if (p) run(async () => { await api.post("/api/auth/2fa/disable", { password: p, code }); setCode(""); await load(); setUser(await api.get("/api/auth/me")); });
              }}>{L("Söndür", "Turn off")}</button>
            )}
          </form>
        </>
      )}
    </section>
  );
}
