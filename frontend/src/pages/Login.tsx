import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ROOT, User } from "../api";
import { useApp } from "../App";
import { t } from "../i18n";
import { L } from "../lang";
import LangSwitch from "../components/LangSwitch";

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
      <button type="submit">{L("Bərpa linki istə", "Send a reset link")}</button>
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
            <span style={{ marginLeft: "auto" }}><LangSwitch /></span>
          </div>
        </div>
        <div>
          <h1>{L("Portfeliniz 3 ay sonra harada ola bilər?", "Where could your portfolio be in 3 months?")}</h1>
          <p className="tag">{L("Ehtimallı proqnoz, risk və mənfəət/zərər təhlili — ABŞ və Avropa səhmləri üçün.",
            "Probabilistic forecast, risk and profit/loss analysis — for US and European stocks.")}</p>
        </div>
        <ul>
          <li><span className="tick">✓</span><span>{L("Bir neçə portfel qurun, hər biri ayrıca saxlanılır və təhlil olunur.", "Build several portfolios; each is stored and analysed separately.")}</span></li>
          <li><span className="tick">✓</span><span>{L("Ən pis halda nə qədər itirə biləcəyinizi (VaR, CVaR) aydın dildə görün.", "See in plain words how much you could lose in a bad case (VaR, CVaR).")}</span></li>
          <li><span className="tick">✓</span><span>{L("Hər rəqəmin yanında ona nə qədər güvənmək olacağı göstərilir.", "Every number shows how far it can be trusted.")}</span></li>
        </ul>
        <p className="fine">
          {L("Nəticələr investisiya tövsiyəsi deyil.", "The results are not investment advice.")}
          {config?.mode === "personal" && !ROOT && L(" Məlumatlar yalnız bu kompüterdə saxlanılır.", " The data stays on this computer only.")}
        </p>
        {ROOT && (
          <p className="fine">
            {L("Hesabınız yoxdur?", "No account?")} <a href={`${ROOT}/demo/`} style={{ color: "inherit", fontWeight: 700 }}>{L("Demoya baxın", "See the demo")}</a> —{" "}
            {L("nümunə portfelin hazır nəticələri.", "the ready results of a sample portfolio.")}
          </p>
        )}
      </div>
      <div className="auth-form">
      <div className="card">
        <h2 style={{ fontSize: 20 }}>{mode === "login" ? L("Hesabınıza daxil olun", "Sign in to your account") : L("Yeni hesab yaradın", "Create a new account")}</h2>
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
            {t("password")} {mode === "register" && <span className="hint">{L("(ən azı 10 simvol; yayılmış parollar, ardıcıllıqlar və e-poçt adı qəbul olunmur)", "(at least 10 characters; common passwords, sequences and your e-mail name are not accepted)")}</span>}
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
          <p className="muted small">{L("İlk qeydiyyatdan keçən istifadəçi avtomatik admin olur (şəxsi rejim).", "The first user to register becomes the administrator (personal mode).")}</p>
        )}
      </div>
      </div>
    </div>
  );
}
