import * as echarts from "echarts";
import { ReactNode, useEffect, useRef, useState } from "react";
import { t } from "../i18n";

export interface Palette {
  fg: string;
  muted: string;
  line: string;
  grid: string;
  q: string;
  bandLight: string;
  bandDark: string;
  pos: string;
  neg: string;
  neutral: string;
  warn: string;
  surface: string;
}

export function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    fg: v("--fg"), muted: v("--muted"), line: v("--line"), grid: v("--grid"), q: v("--q"),
    bandLight: v("--q-band-light"), bandDark: v("--q-band-dark"), pos: v("--pos"), neg: v("--neg"),
    neutral: v("--neutral"), warn: v("--warn"), surface: v("--surface"),
  };
}

/** Re-render charts when the colour scheme changes. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setV((x) => x + 1);
    mq.addEventListener("change", on);
    const obs = new MutationObserver(on);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", on);
      obs.disconnect();
    };
  }, []);
  return v;
}

export function baseOption(p: Palette): echarts.EChartsOption {
  return {
    animation: false,
    aria: { enabled: true },
    textStyle: { color: p.muted, fontFamily: "Segoe UI, system-ui, sans-serif", fontSize: 14.5 },
    grid: { left: 64, right: 24, top: 24, bottom: 40, containLabel: false },
    tooltip: {
      backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.fg, fontSize: 15 },
      confine: true,
    },
  };
}

export function axisStyle(p: Palette) {
  return {
    axisLine: { lineStyle: { color: p.line } },
    axisTick: { show: false },
    axisLabel: { color: p.muted, fontSize: 14, hideOverlap: true },
    splitLine: { lineStyle: { color: p.grid, type: "solid" as const, width: 1 } },
  };
}

interface Props {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  build: (p: Palette) => echarts.EChartsOption;
  table: ReactNode;
  height?: "short" | "tall";
  /** exact chart height in px (e.g. one row per scenario), overrides `height` */
  chartHeight?: number;
  ariaLabel: string;
  extra?: ReactNode;
  deps: unknown[];
}

/** A chart card with a mandatory table view and keyboard focus. */
export function ChartCard({ id, title, subtitle, build, table, height, chartHeight, ariaLabel, extra, deps }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.ECharts | null>(null);
  const cursor = useRef(-1);
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const theme = useThemeVersion();

  useEffect(() => {
    if (mode !== "chart" || !ref.current) return;
    const inst = echarts.init(ref.current, undefined, { renderer: "canvas" });
    inst.setOption(build(readPalette()));
    instRef.current = inst;
    cursor.current = -1;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      instRef.current = null;
      inst.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, theme, ...deps]);

  /** Arrow keys walk the data points and show the same tooltip as the mouse would. */
  function moveTip(key: string): boolean {
    const inst = instRef.current;
    if (!inst) return false;
    const series = ((inst.getOption() as { series?: { data?: unknown[] }[] }).series ?? []);
    let si = 0;
    let n = 0;
    series.forEach((s, i) => {
      const len = s.data?.length ?? 0;
      if (len > n) {
        n = len;
        si = i;
      }
    });
    if (!n) return false;
    const cur = cursor.current;
    const next = key === "Home" ? 0 : key === "End" ? n - 1 : Math.min(n - 1, Math.max(0, cur + (key === "ArrowRight" ? 1 : -1)));
    cursor.current = next;
    inst.dispatchAction({ type: "showTip", seriesIndex: si, dataIndex: next });
    return true;
  }

  return (
    <section className="card" id={id} aria-label={title}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
        <div className="row-actions">
          {extra}
          <div className="toggle" role="group" aria-label="Görünüş">
            <button aria-pressed={mode === "chart"} onClick={() => setMode("chart")}>{t("chart")}</button>
            <button aria-pressed={mode === "table"} onClick={() => setMode("table")}>{t("table")}</button>
          </div>
        </div>
      </div>
      {mode === "chart" ? (
        // distinct keys: ECharts' dispose() empties its container, so React must never reuse that node for the table
        <div
          key="chart"
          ref={ref}
          className={`chart ${height ?? ""}`}
          style={chartHeight ? { height: chartHeight } : undefined}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setMode("table");
            } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && moveTip(e.key)) {
              e.preventDefault();
            }
          }}
          onBlur={() => instRef.current?.dispatchAction({ type: "hideTip" })}
          title="← →: nöqtələr üzrə gəzmək, Enter: cədvəl görünüşü"
        />
      ) : (
        <div key="table" className="table-wrap">{table}</div>
      )}
    </section>
  );
}
