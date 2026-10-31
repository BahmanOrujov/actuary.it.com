import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ROOT, User } from "../api";
import { useApp } from "../App";
import { t } from "../i18n";

function ForgotForm({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api.post<{ message: string }>("/api/auth/password-reset/request", { email });
          setMsg(r.message);
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <p className="muted small">{t("forgotText")}</p>
      <label>
        {t("email")}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit">Bərpa linki istə</button>
      {msg && <p className="small" role="status">{msg}</p>}
    </form>
  );
}

export default function LoginPage() {
  const { setUser, config } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await api.post<User>(`/api/auth/${mode}`, { email, password });
      setUser(u);
      nav("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-side">
        <div>
          <div className="row-actions" style={{ gap: 10, fontWeight: 700, fontSize: 16 }}>
            <span className="logo" style={{ background: "rgba(255,255,255,0.18)" }} aria-hidden="true">PA</span>
            {config?.brand ?? t("brand")}
          </div>
        </div>
        <div>
          <h1>Portfeliniz 3 ay sonra harada ola bilər?</h1>
          <p className="tag">Ehtimallı proqnoz, risk və mənfəət/zərər təhlili — ABŞ və Avropa səhmləri üçün.</p>
        </div>
        <ul>
          <li><span className="tick">✓</span><span>Bir neçə portfel qurun, hər biri ayrıca saxlanılır və təhlil olunur.</span></li>
          <li><span className="tick">✓</span><span>Ən pis halda nə qədər itirə biləcəyinizi (VaR, CVaR) aydın dildə görün.</span></li>
          <li><span className="tick">✓</span><span>Hər rəqəmin yanında ona nə qədər güvənmək olacağı göstərilir.</span></li>
        </ul>
        <p className="fine">
          Nəticələr investisiya tövsiyəsi deyil.
          {config?.mode === "personal" && !ROOT && " Məlumatlar yalnız bu kompüterdə saxlanılır."}
        </p>
        {ROOT && (
          <p className="fine">
            Hesabınız yoxdur? <a href={`${ROOT}/demo/`} style={{ color: "inherit", fontWeight: 700 }}>Demoya baxın</a> —
            nümunə portfelin hazır nəticələri.
          </p>
        )}
      </div>
      <div className="auth-form">
      <div className="card">
        <h2 style={{ fontSize: 20 }}>{mode === "login" ? "Hesabınıza daxil olun" : "Yeni hesab yaradın"}</h2>
        <div className="toggle" role="group">
          <button aria-pressed={mode === "login"} onClick={() => setMode("login")}>{t("login")}</button>
          <button aria-pressed={mode === "register"} onClick={() => setMode("register")}>{t("register")}</button>
        </div>
        <form onSubmit={submit} className="grid">
          <label>
            {t("email")}
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            {t("password")} {mode === "register" && <span className="hint">(ən azı 10 simvol; yayılmış parollar, ardıcıllıqlar və e-poçt adı qəbul olunmur)</span>}
            <input
              type="password"
              required
              minLength={mode === "register" ? 10 : 1}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="banner err" role="alert">✕ {error}</div>}
          <button className="primary" disabled={busy} type="submit">
            {mode === "login" ? t("login") : t("register")}
          </button>
        </form>
        <p style={{ marginTop: 14 }}>
          <button className="link" onClick={() => setShowForgot((x) => !x)}>{t("forgot")}</button>
        </p>
        {showForgot && <ForgotForm defaultEmail={email} />}
        {mode === "register" && (
          <p className="muted small">İlk qeydiyyatdan keçən istifadəçi avtomatik admin olur (şəxsi rejim).</p>
        )}
      </div>
      </div>
    </div>
  );
}
