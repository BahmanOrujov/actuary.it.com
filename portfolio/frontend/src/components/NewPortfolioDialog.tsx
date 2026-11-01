import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PortfolioSummary } from "../api";
import { useApp } from "../App";
import { pct } from "../format";
import { Key, t } from "../i18n";
import { L } from "../lang";

export default function NewPortfolioDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, reloadPortfolios } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [ccy, setCcy] = useState(config?.default_currency ?? "USD");
  const [profile, setProfile] = useState("moderate");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (config) setCcy(config.default_currency);
  }, [config]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<PortfolioSummary>("/api/portfolios", { name: name.trim(), base_currency: ccy, risk_profile: profile });
      await reloadPortfolios();
      setName("");
      onClose();
      nav(`/portfolios/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="new-pf-title">
      <form className="dialog-body" onSubmit={submit}>
        <div>
          <h2 id="new-pf-title" style={{ fontSize: 18 }}>{t("newPortfolio")}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {L("Hər portfel ayrıca saxlanılır və müstəqil təhlil olunur. Sonradan adını, valyutasını və risk profilini dəyişmək olar.",
              "Each portfolio is stored and analysed separately. You can change its name, currency and risk profile later.")}
          </p>
        </div>
        <label>
          {t("name")}
          <input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={L("məs. Uzunmüddətli ABŞ səhmləri", "e.g. Long-term US stocks")} />
        </label>
        <div className="form-row">
          <label>
            {t("baseCurrency")}
            <select value={ccy} onChange={(e) => setCcy(e.target.value)}>
              {(config?.currencies ?? ["USD"]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            {t("riskProfile")}
            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
              {Object.entries(config?.risk_profiles ?? {}).map(([k, v]) => (
                <option key={k} value={k}>{t(k as Key)} (limit {pct(v)})</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {L("Risk profili 3 ayda qəbul etdiyiniz maksimum itkini (CVaR 95%) təyin edir; tövsiyələr bu limitə görə verilir.",
            "The risk profile sets the largest loss you accept over 3 months (CVaR 95%); recommendations follow this limit.")}
        </p>
        {error && <div className="banner err" role="alert">✕ {error}</div>}
        <div className="form-actions">
          <button type="button" onClick={onClose}>{t("cancel")}</button>
          <button className="primary" type="submit" disabled={busy || !name.trim()}>{t("create")}</button>
        </div>
      </form>
    </dialog>
  );
}
