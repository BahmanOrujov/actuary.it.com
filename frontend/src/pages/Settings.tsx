import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { pct } from "../format";
import { Key, t } from "../i18n";

export default function SettingsPage() {
  const { user, setUser, config } = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const nav = useNavigate();

  async function changePw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/api/auth/password", { old_password: fd.get("old"), new_password: fd.get("new") });
      setMsg("✓ Parol dəyişdirildi. Digər cihazlardakı sessiyalar bağlandı.");
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
          <div className="lead">Hesab və təhlükəsizlik. Portfelin valyutası və risk limiti hər portfelin “Tərkib” bölməsində dəyişdirilir.</div>
        </div>
      </div>
      <section className="card">
        <h2>Hesab</h2>
        <p className="muted">{user?.email} · rol: {user?.role === "admin" ? "admin" : "müştəri"}</p>
        <form className="form-row" onSubmit={changePw}>
          <label>Köhnə parol<input name="old" type="password" required autoComplete="current-password" /></label>
          <label>Yeni parol (ən azı 10 simvol; yayılmış parollar, ardıcıllıqlar və e-poçt adı qəbul olunmur)<input name="new" type="password" required minLength={10} autoComplete="new-password" /></label>
          <button type="submit">Parolu dəyiş</button>
        </form>
        {msg && <p className="small">{msg}</p>}
      </section>
      <section className="card">
        <h2>Risk profilləri (default limitlər)</h2>
        <p className="muted small">Portfel üçün 3 ayda qəbul edilən maksimum itki (CVaR 95%). Hər portfeldə ayrıca dəyişmək olar.</p>
        <ul>
          {Object.entries(config?.risk_profiles ?? {}).map(([k, v]) => (
            <li key={k}>{t(k as Key)}: {pct(v)}</li>
          ))}
        </ul>
      </section>
      {config?.csv_import && (
        <section className="card">
          <h2>CSV idxalı</h2>
          <p className="disclaimer">{config.csv_notice}</p>
        </section>
      )}
      <section className="card">
        <h2>Hesabı sil</h2>
        <p className="muted small">Hesab, bütün portfellər və nəticələr birdəfəlik silinəcək.</p>
        <button
          className="danger"
          onClick={async () => {
            if (confirm("Hesabınız və bütün məlumatlarınız silinsin? Bu geri qaytarıla bilməz.")) {
              await api.del("/api/auth/account");
              setUser(null);
              nav("/login");
            }
          }}
        >
          Hesabı sil
        </button>
      </section>
    </>
  );
}
