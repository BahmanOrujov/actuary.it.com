import { PortfolioSummary, Reliability } from "../api";
import { t, Key } from "../i18n";

/** One status per portfolio for the sidebar dot and overview cards: css class + plain label. */
export function portfolioState(p: PortfolioSummary): { cls: string; label: string } {
  const r = p.last_run;
  if (!r) return { cls: "", label: "hələ təhlil edilməyib" };
  if (r.status === "queued" || r.status === "running") return { cls: "running", label: "hesablanır" };
  if (r.status === "failed") return { cls: "failed", label: "son təhlildə xəta" };
  if (r.stale) return { cls: "stale", label: "portfel dəyişib, nəticə köhnəlib" };
  return { cls: r.reliability, label: `etibarlılıq: ${t(r.reliability as Key)}` };
}

const ICON: Record<string, string> = { high: "✓", medium: "◐", "medium-low": "◔", low: "!", checking: "…" };

export function ReliabilityBadge({ level }: { level: Reliability | string }) {
  return (
    <span className={`badge ${level}`} title="Etibarlılıq">
      <span aria-hidden="true">{ICON[level] ?? "•"}</span> {t(level as Key)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    done: ["ok", "✓", "hazır"],
    running: ["checking", "…", "işləyir"],
    queued: ["checking", "…", "növbədə"],
    failed: ["err", "✕", "xəta"],
    pass: ["ok", "✓", "keçdi"],
    conditional: ["warn", "◐", "şərti"],
    fail: ["err", "✕", "keçmədi"],
    pending: ["checking", "…", "gözləyir"],
  };
  const [cls, icon, label] = map[status] ?? ["checking", "•", status];
  return (
    <span className={`badge ${cls}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}
