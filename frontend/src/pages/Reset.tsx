import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { L } from "../lang";

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const invite = params.get("invite") === "1"; // link from an admin's invitation: the first password, not a reset
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/auth/password-reset/confirm", { token, new_password: pw });
      setMsg({ ok: true, text: invite ? L("Parol təyin edildi. İndi e-poçtunuz və bu parolla daxil ola bilərsiniz.",
        "Your password is set. You can now sign in with your e-mail and this password.")
        : L("Parol yeniləndi. İndi yeni parolla daxil ola bilərsiniz.", "Password updated. You can now sign in with the new password.") });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="center">
      <div className="card">
        <h1>{invite ? L("Hesabınızı aktivləşdirin", "Activate your account") : L("Parolun bərpası", "Reset your password")}</h1>
        {invite && <p className="muted">{L("Sizi Portfel Analizinə dəvət ediblər. Hesaba giriş üçün öz parolunuzu təyin edin.", "You have been invited to Portfel Analizi. Set your own password to sign in.")}</p>}
        {!token ? (
          <p className="banner err">✕ {L("Link natamamdır (token yoxdur).", "The link is incomplete (no token).")}</p>
        ) : (
          <form onSubmit={submit} className="grid">
            <label>
              {L("Yeni parol (ən azı 10 simvol; yayılmış parollar, ardıcıllıqlar və e-poçt adı qəbul olunmur)", "New password (at least 10 characters; common passwords, sequences and your e-mail name are not accepted)")}
              <input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <button className="primary" type="submit">{invite ? L("Parolu təyin et", "Set the password") : L("Parolu yenilə", "Update the password")}</button>
          </form>
        )}
        {msg && <div className={`banner ${msg.ok ? "info" : "err"}`} role="status">{msg.ok ? "✓" : "✕"} {msg.text}</div>}
        <p><Link to="/login">{L("Girişə qayıt", "Back to sign in")}</Link></p>
      </div>
    </div>
  );
}
