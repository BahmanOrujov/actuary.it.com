import { FormEvent, useEffect, useState } from "react";
import { api, apiUrl, PortfolioDetail } from "../api";
import { Icon } from "./Icons";
import { L, LANG } from "../lang";

/** Daily bar columns the export offers (keys of PRICE_FIELDS in the API); Close is preselected. */
const FIELDS: [string, string][] = [
  ["close", "Close"], ["adj_close", "Adj Close"], ["open", "Open"], ["high", "High"], ["low", "Low"],
  ["volume", L("Həcm", "Volume")],
];

// local calendar date (toISOString would shift it to UTC)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Downloads the daily prices of the portfolio's stocks as Excel: a Date column and one column per stock.
 *  `refresh` changes when a Generate finishes or the portfolio changes: the stock list is reloaded and the end
 *  date moves to today, so the next download has the newest prices. */
export default function PriceExport({ pid, onClose, refresh }: { pid: number; onClose: () => void; refresh: string }) {
  const [stocks, setStocks] = useState<{ id: number; symbol: string; name: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [fields, setFields] = useState<Set<string>>(new Set(["close"]));
  const today = new Date();
  const [start, setStart] = useState(iso(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())));
  const [end, setEnd] = useState(iso(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PortfolioDetail>(`/api/portfolios/${pid}`).then((p) => {
      // every stock the portfolio has traded, sold ones included
      const seen = new Map<number, { id: number; symbol: string; name: string }>();
      for (const t of p.transactions) seen.set(t.instrument.id, { id: t.instrument.id, symbol: t.instrument.investing_symbol, name: t.instrument.name });
      const list = [...seen.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
      setStocks(list);
      setPicked(new Set(list.map((s) => s.id)));
    }).catch((err) => setError((err as Error).message));
    setEnd(iso(new Date()));
  }, [pid, refresh]);

  function toggle<T>(set: Set<T>, v: T, update: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    update(next);
  }

  async function download(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const q = new URLSearchParams({
        start, end, lang: LANG,
        instruments: [...picked].join(","),
        fields: FIELDS.map(([k]) => k).filter((k) => fields.has(k)).join(","),
      });
      const r = await fetch(apiUrl(`/api/portfolios/${pid}/prices.xlsx?${q}`), { credentials: "same-origin", headers: { "x-lang": LANG } });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(typeof body?.detail === "string" ? body.detail : `HTTP ${r.status}`);
      }
      const name = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get("content-disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name ? decodeURIComponent(name) : "prices.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allPicked = !!stocks && picked.size === stocks.length;

  return (
    <section className="card">
      <div className="card-head" style={{ marginBottom: 4 }}>
        <div>
          <h2><Icon name="download" size={18} /> {L("Qiymətləri Excel-ə yüklə", "Download prices to Excel")}</h2>
          <div className="sub">
            {L("Gündəlik qiymətlər: birinci sütunda tarix, hər səhmin qiyməti ayrıca sütunda. Hər seçilən göstərici ayrıca vərəqdə olur.",
              "Daily prices: the date in the first column and each stock's price in its own column. Each chosen measure gets its own sheet.")}
          </div>
        </div>
        <button className="link" onClick={onClose}>{L("Bağla", "Close")}</button>
      </div>
      {error && <div className="banner err" role="alert">✕ {error}</div>}
      <form onSubmit={download}>
        <div className="form-row">
          <label>{L("Başlanğıc tarixi", "Start date")}<input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} required /></label>
          <label>{L("Son tarix", "End date")}<input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
          <legend className="small muted">
            {L("Səhmlər", "Stocks")}{" "}
            {stocks && stocks.length > 1 && (
              <button type="button" className="link" onClick={() => setPicked(allPicked ? new Set() : new Set(stocks.map((s) => s.id)))}>
                {allPicked ? L("heç birini seçmə", "select none") : L("hamısını seç", "select all")}
              </button>
            )}
          </legend>
          {stocks === null ? <span className="small muted">…</span> : (
            <div className="form-row" style={{ gap: "6px 16px" }}>
              {stocks.map((s) => (
                <label key={s.id} className="inline" title={s.name} style={{ flex: "0 0 auto" }}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(picked, s.id, setPicked)} /> {s.symbol}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
          <legend className="small muted">{L("Sütunlar", "Columns")}</legend>
          <div className="form-row" style={{ gap: "6px 16px" }}>
            {FIELDS.map(([k, label]) => (
              <label key={k} className="inline" style={{ flex: "0 0 auto" }}>
                <input type="checkbox" checked={fields.has(k)} onChange={() => toggle(fields, k, setFields)} /> {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          <button className="primary" type="submit" disabled={busy || !picked.size || !fields.size || !start || !end}>
            <Icon name="download" size={16} /> {busy ? L("Hazırlanır…", "Preparing…") : L("Excel yüklə", "Download Excel")}
          </button>
        </div>
      </form>
    </section>
  );
}
