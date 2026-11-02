import { FormEvent, useState } from "react";
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
