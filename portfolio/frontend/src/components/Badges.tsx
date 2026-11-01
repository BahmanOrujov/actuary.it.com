import { PortfolioSummary, Reliability } from "../api";
import { t, Key } from "../i18n";
import { L } from "../lang";

/** One status per portfolio for the sidebar dot and overview cards: css class + plain label. */
export function portfolioState(p: PortfolioSummary): { cls: string; label: string } {
  const r = p.last_run;
  if (!r) return { cls: "", label: L("hələ təhlil edilməyib", "not analysed yet") };
  if (r.status === "queued" || r.status === "running") return { cls: "running", label: L("hesablanır", "analysing") };
  if (r.status === "failed") return { cls: "failed", label: L("son təhlildə xəta", "the last analysis failed") };
  if (r.stale) return { cls: "stale", label: L("portfel dəyişib, nəticə köhnəlib", "portfolio changed, result is outdated") };
  return { cls: r.reliability, label: `${L("etibarlılıq", "reliability")}: ${t(r.reliability as Key)}` };
}

const ICON: Record<string, string> = { high: "✓", medium: "◐", "medium-low": "◔", low: "!", checking: "…" };

export function ReliabilityBadge({ level }: { level: Reliability | string }) {
  return (
    <span className={`badge ${level}`} title={L("Etibarlılıq", "Reliability")}>
      <span aria-hidden="true">{ICON[level] ?? "•"}</span> {t(level as Key)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    done: ["ok", "✓", L("hazır", "done")],
    running: ["checking", "…", L("işləyir", "running")],
    queued: ["checking", "…", L("növbədə", "queued")],
    failed: ["err", "✕", L("xəta", "failed")],
    pass: ["ok", "✓", L("keçdi", "passed")],
    conditional: ["warn", "◐", L("şərti", "conditional")],
    fail: ["err", "✕", L("keçmədi", "failed")],
    pending: ["checking", "…", L("gözləyir", "pending")],
  };
  const [cls, icon, label] = map[status] ?? ["checking", "•", status];
  return (
    <span className={`badge ${cls}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}
