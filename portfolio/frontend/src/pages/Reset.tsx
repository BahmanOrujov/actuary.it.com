import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/auth/password-reset/confirm", { token, new_password: pw });
      setMsg({ ok: true, text: "Parol yeniləndi. İndi yeni parolla daxil ola bilərsiniz." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="center">
      <div className="card">
        <h1>Parolun bərpası</h1>
        {!token ? (
          <p className="banner err">✕ Link natamamdır (token yoxdur).</p>
        ) : (
          <form onSubmit={submit} className="grid">
            <label>
              Yeni parol (ən azı 10 simvol; yayılmış parollar, ardıcıllıqlar və e-poçt adı qəbul olunmur)
              <input type="password" required minLength={10} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <button className="primary" type="submit">Parolu yenilə</button>
          </form>
        )}
        {msg && <div className={`banner ${msg.ok ? "info" : "err"}`} role="status">{msg.ok ? "✓" : "✕"} {msg.text}</div>}
        <p><Link to="/login">Girişə qayıt</Link></p>
      </div>
    </div>
  );
}
