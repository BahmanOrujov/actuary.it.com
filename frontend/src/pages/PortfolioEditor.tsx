import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Candidate, PortfolioDetail, RunResult, Suggestion } from "../api";
import { useApp } from "../App";
import { Icon } from "../components/Icons";
import { dateAz, money, pct, price } from "../format";
import { usePortfolio } from "./PortfolioLayout";
import { Key, t } from "../i18n";
import { L } from "../lang";

function AddTransaction({ pid, onAdded, csvEnabled }: { pid: number; onAdded: () => void; csvEnabled: boolean }) {
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState("");
  const [px, setPx] = useState("");
  const [fees, setFees] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [suggest, setSuggest] = useState<Suggestion[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setSuggest([]);
      return;
    }
    const h = window.setTimeout(() => {
      api.get<Suggestion[]>(`/api/instruments/suggest?q=${encodeURIComponent(term)}`).then(setSuggest).catch(() => setSuggest([]));
    }, 250);
    return () => window.clearTimeout(h);
  }, [q]);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setMsg(null);
    setChosen(null);
    setResult(null);
    try {
      const r = await api.get<{ candidates: Candidate[]; auto_select: boolean; message: string | null }>(
        `/api/symbols/search?q=${encodeURIComponent(q.trim())}`,
      );
      setCands(r.candidates);
      if (r.auto_select) setChosen(r.candidates[0]);
      setMsg(r.message);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post<{ trade_date: string; price: number; flags: { note?: string; price_source?: string }; warnings: string[] }>(
        `/api/portfolios/${pid}/transactions`,
        {
          provider_symbol: chosen.provider_symbol,
          investing_symbol: q.trim().toUpperCase(),
          side,
          quantity: Number(qty.replace(",", ".")),
          trade_date: date || null,
          price: px ? Number(px.replace(",", ".")) : null,
          fees: fees ? Number(fees.replace(",", ".")) : 0,
        },
      );
      const used = `${L("İstifadə olunan: tarix", "Used: date")} ${dateAz(r.trade_date)}, ${L("qiymət", "price")} ${price(r.price)}${r.flags.note ? ` — ${r.flags.note}` : ""}`;
      setResult({ ok: true, text: [used, ...r.warnings].join(" · ") });
      setQty("");
      setDate("");
      setPx("");
      setFees("");
      onAdded();
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <h2>{t("addStock")}</h2>
          <div className="sub">{L("Alış və ya satış əlavə edin. Simvolu investing.com-da göründüyü kimi yazın (ABŞ və Avropa birjaları).", "Add a buy or a sell. Type the symbol as shown on investing.com (US and European exchanges).")}</div>
        </div>
      </div>
      <form className="form-row" onSubmit={search}>
        <label style={{ flex: "1 1 260px" }}>
          {t("symbol")}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="AAPL, SAP, VOD…" maxLength={32}
            list="instrument-suggest" autoComplete="off" />
          <datalist id="instrument-suggest">
            {suggest.map((s) => (
              <option key={s.provider_symbol} value={s.investing_symbol}>{`${s.name} · ${s.exchange} · ${s.currency}`}</option>
            ))}
          </datalist>
        </label>
        <button type="submit" disabled={busy || !q.trim()}>{busy && !chosen ? L("Axtarılır…", "Searching…") : t("search")}</button>
      </form>
      {msg && <p className="muted small" style={{ marginTop: 8 }}>{msg}</p>}
      {cands && cands.length > 1 && !chosen && (
        <div className="candidates" role="listbox" aria-label={L("Namizədlər", "Candidates")}>
          <div className="small muted" style={{ padding: "6px 10px" }}>{L("Bir neçə uyğunluq tapıldı — düzgününü seçin:", "Several matches found — choose the right one:")}</div>
          {cands.map((c) => (
            <button key={c.provider_symbol} role="option" aria-selected={false} onClick={() => setChosen(c)}>
              <b>{c.provider_symbol}</b> — {c.name} · {c.exchange}
              {c.country ? ` · ${c.country}` : ""} {c.currency ? ` · ${c.currency}${c.currency_inferred ? L(" (birjaya görə)", " (from the exchange)") : ""}` : ""} · {c.type}
              {c.source === "csv" ? " · CSV" : ""}
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <form onSubmit={submit}>
          <div className="chosen">
            <span className="ticker">{chosen.provider_symbol}</span>
            <span>{chosen.name}</span>
            <span className="muted small">{chosen.exchange}{chosen.currency ? ` · ${chosen.currency}` : ""}</span>
            {cands && cands.length > 1 && (
              <button type="button" className="link" style={{ marginLeft: "auto" }} onClick={() => setChosen(null)}>{L("dəyiş", "change")}</button>
            )}
          </div>
          <div className="form-grid">
            <label>
              {t("side")}
              <select value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}>
                <option value="BUY">{t("buy")}</option>
                <option value="SELL">{t("sell")}</option>
              </select>
            </label>
            <label>
              {t("quantity")} *
              <input required inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label>
              {t("date")} ({t("optional")})
              <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              {t("price")} ({t("optional")})
              <input inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} />
            </label>
            <label>
              {t("fees")} ({t("optional")})
              <input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />
            </label>
            <button className="primary" type="submit" disabled={busy}>{L("Əlavə et", "Add")}</button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {L("Tarix boşdursa — bu gün; qiymət boşdursa — həmin günün bağlanış qiyməti (ticarət günü deyilsə, əvvəlki ticarət günü). Hər ikisi boşdursa — cari tarix və son qiymət.",
              "No date — today; no price — that day's close (the previous trading day if it is not one). Neither — today's date and the latest price.")}
          </p>
        </form>
      )}
      {result && <div className={`banner ${result.ok ? "info" : "err"}`} role="status">{result.ok ? "✓" : "✕"} {result.text}</div>}
      {csvEnabled && <CsvImport pid={pid} />}
    </section>
  );
}

function CsvImport({ pid }: { pid: number }) {
  const { config } = useApp();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api.upload<{ provider_symbol: string; rows: number; first: string; last: string; note: string }>(
        `/api/portfolios/${pid}/csv-import`,
        fd,
      );
      setMsg({ ok: true, text: L(`${r.rows} gün yükləndi (${dateAz(r.first)} – ${dateAz(r.last)}). İndi "${r.provider_symbol}" simvolunu axtarıb əlavə edə bilərsiniz. ${r.note}`,
        `${r.rows} days loaded (${dateAz(r.first)} – ${dateAz(r.last)}). You can now search for "${r.provider_symbol}" and add it. ${r.note}`) });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button className="link" onClick={() => setOpen((x) => !x)}>{t("csvImport")} (investing.com Historical Data)</button>
      {open && (
        <form onSubmit={submit} className="grid" style={{ marginTop: 8 }}>
          <p className="disclaimer">{config?.csv_notice}</p>
          <div className="form-row">
            <label>{L("CSV fayl", "CSV file")}<input type="file" name="file" accept=".csv,text/csv" required /></label>
            <label>{L("Simvol", "Symbol")}<input name="symbol" required maxLength={20} /></label>
            <label>{t("name")}<input name="name" maxLength={120} /></label>
            <label>
              {L("Birja", "Exchange")}
              <select name="exchange" defaultValue="NYSE">
                {["NYSE", "NASDAQ", "LSE", "XETRA", "EPA"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>
              {L("Mənbə", "Source")}
              <select name="source" defaultValue="investing">
                <option value="investing">investing.com</option>
                <option value="user">{L("Digər (istifadə hüququnuz olan)", "Other (that you have the right to use)")}</option>
              </select>
            </label>
            <label>
              {L("Valyuta", "Currency")}
              <select name="currency" defaultValue="USD">
                {(config?.currencies ?? ["USD"]).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <button type="submit">{L("Yüklə", "Upload")}</button>
          </div>
        </form>
      )}
      {msg && <div className={`banner ${msg.ok ? "info" : "err"}`}>{msg.ok ? "✓" : "✕"} {msg.text}</div>}
    </div>
  );
}

const PRICE_SRC: Record<string, string> = { user: L("daxil edilib", "entered"), close: L("bağlanış", "close"), latest: L("son qiymət", "latest price") };

export default function PortfolioEditor() {
  const { id } = useParams();
  const pid = Number(id);
  const { config, reloadPortfolios } = useApp();
  const { run } = usePortfolio();
  const [p, setP] = useState<PortfolioDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const load = useCallback(
    () => api.get<PortfolioDetail>(`/api/portfolios/${pid}`).then(setP).catch((e) => setError(e.message)),
    [pid],
  );
  /** After any change: reload this page and the shared list (the header and sidebar show version-based staleness). */
  const changed = useCallback(() => {
    load();
    reloadPortfolios();
  }, [load, reloadPortfolios]);
  useEffect(() => {
    setP(null);
    load();
  }, [load]);

  if (error) return <div className="banner err">✕ {error}</div>;
  if (!p) return <div className="muted">{L("Yüklənir…", "Loading…")}</div>;

  return (
    <div className="cols">
      <div style={{ minWidth: 0 }}>
        <AddTransaction pid={pid} onAdded={changed} csvEnabled={!!config?.csv_import} />
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("positions")}</h2>
              <div className="sub">{L("Açıq mövqelər. Hədəf qiymət və stop-loss istəyə bağlıdır — nəticələrdə onlara çatma ehtimalı göstərilir.", "Open positions. Target price and stop-loss are optional — the results show the probability of reaching them.")}</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L("Səhm", "Stock")}</th><th className="num">{t("quantity")}</th>
                  <th className="num">{L("Bazar dəyəri", "Market value")}</th><th className="num">{L("Mənfəət/zərər", "Profit/loss")}</th>
                  <th>{t("target")}</th><th>{t("stopLoss")}</th><th />
                </tr>
              </thead>
              <tbody>
                {p.positions.map((pos) => (
                  <PositionRow key={pos.instrument_id} pid={pid} pos={pos} onSaved={changed} ccy={p.base_currency}
                    live={run?.status === "done" ? run.result?.current.positions.find((x) => x.investing_symbol === pos.investing_symbol) : undefined} />
                ))}
                {p.positions.length === 0 && (
                  <tr><td colSpan={7} className="muted">{L("Açıq mövqe yoxdur. Yuxarıdan səhm əlavə edin.", "No open positions. Add a stock above.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("transactions")}</h2>
              <div className="sub">{L("Bütün alış və satışlar. Mənfəət/zərər FIFO ilə hesablanır.", "All buys and sells. Profit/loss uses FIFO.")}</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("date")}</th><th>{L("Simvol", "Symbol")}</th><th>{t("side")}</th><th className="num">{t("quantity")}</th>
                  <th className="num">{t("price")}</th><th className="num">{t("fees")}</th><th>{L("Qeyd", "Note")}</th><th />
                </tr>
              </thead>
              <tbody>
                {p.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{dateAz(tx.trade_date)}{tx.flags.date_source === "today" && <span className="muted small"> ({L("bu gün", "today")})</span>}</td>
                    <td title={tx.instrument.name}><span className="ticker">{tx.instrument.investing_symbol}</span>
                      {tx.instrument.provider_symbol !== tx.instrument.investing_symbol && (
                        <span className="muted small"> {tx.instrument.provider_symbol}</span>
                      )}</td>
                    <td>{tx.side === "BUY" ? <span className="badge checking">{t("buy")}</span> : <span className="badge warn">{t("sell")}</span>}</td>
                    <td className="num">{tx.quantity}</td>
                    <td className="num">{price(tx.price, tx.currency)}</td>
                    <td className="num">{tx.fees ? price(tx.fees, tx.currency) : "—"}</td>
                    <td className="small muted">
                      {L("qiymət", "price")}: {PRICE_SRC[tx.flags.price_source ?? "user"]}
                      {tx.flags.note ? ` · ${tx.flags.note}` : ""}
                      {(tx.flags.warnings ?? []).map((w) => <div key={w} style={{ color: "var(--warn)" }}>⚠ {w}</div>)}
                    </td>
                    <td>
                      <button
                        className="link danger"
                        onClick={async () => {
                          if (!confirm(L(`${tx.instrument.investing_symbol} əməliyyatı silinsin?`, `Delete the ${tx.instrument.investing_symbol} transaction?`))) return;
                          try {
                            await api.del(`/api/portfolios/${pid}/transactions/${tx.id}`);
                            changed();
                          } catch (err) {
                            alert((err as Error).message);
                          }
                        }}
                      >
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
                {p.transactions.length === 0 && <tr><td colSpan={8} className="muted">{L("Hələ əməliyyat yoxdur.", "No transactions yet.")}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside>
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>{L("Portfelin parametrləri", "Portfolio settings")}</h2>
          <form
            className="grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const lim = String(fd.get("risk_limit") || "").replace(",", ".");
              try {
                await api.patch(`/api/portfolios/${pid}`, {
                  base_currency: fd.get("base_currency"),
                  risk_profile: fd.get("risk_profile"),
                  cash: Number(String(fd.get("cash") || "0").replace(",", ".")),
                  ...(lim ? { risk_limit: Number(lim) / 100 } : { clear_risk_limit: true }),
                });
                setSettingsMsg(L("✓ Yadda saxlanıldı", "✓ Saved"));
                changed();
              } catch (err) {
                setSettingsMsg(`✕ ${(err as Error).message}`);
              }
            }}
          >
            <label>
              {t("baseCurrency")}
              <select name="base_currency" defaultValue={p.base_currency}>
                {(config?.currencies ?? ["USD"]).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              {t("riskProfile")}
              <select name="risk_profile" defaultValue={p.risk_profile}>
                {Object.entries(config?.risk_profiles ?? {}).map(([k, v]) => (
                  <option key={k} value={k}>{t(k as Key)} ({pct(v)})</option>
                ))}
              </select>
            </label>
            <label>
              {L("Fərdi risk limiti, %", "Custom risk limit, %")}
              <input name="risk_limit" inputMode="decimal" placeholder={L("profilə görə", "from the profile")} defaultValue={p.risk_limit ? String(p.risk_limit * 100) : ""} />
              <span className="hint">{L("3 ayda qəbul edilən maksimum itki (CVaR 95%). Boş = profilin limiti.", "The largest loss accepted over 3 months (CVaR 95%). Empty = the profile's limit.")}</span>
            </label>
            <label>
              {t("cash")} ({p.base_currency})
              <input name="cash" inputMode="decimal" defaultValue={String(p.cash)} />
            </label>
            <button type="submit">{t("save")}</button>
            {settingsMsg && <p className="small" role="status" style={{ margin: 0 }}>{settingsMsg}</p>}
          </form>
        </section>
        <section className="card small">
          <h3 className="row-actions"><Icon name="bulb" size={16} /> {L("Necə işləyir?", "How does it work?")}</h3>
          <ul className="plain muted">
            <li>{L("Tarix boşdursa bu gün, qiymət boşdursa həmin günün bağlanış qiyməti götürülür.", "With no date, today is used; with no price, that day's close.")}</li>
            <li>{L("Portfel dəyişəndə köhnə nəticələr “köhnəlib” kimi işarələnir — yenidən Generate basın.", "When the portfolio changes, old results are marked “outdated” — press Generate again.")}</li>
            <li>{L("Hər portfel öz valyutasında və öz risk limiti ilə təhlil olunur.", "Each portfolio is analysed in its own currency with its own risk limit.")}</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function PositionRow({ pid, pos, onSaved, live, ccy }: {
  pid: number;
  pos: PortfolioDetail["positions"][number];
  onSaved: () => void;
  /** This position in the latest finished run (market value, P&L), if any. */
  live?: RunResult["current"]["positions"][number];
  ccy: string;
}) {
  const init = { tp: pos.target_price ? String(pos.target_price) : "", sl: pos.stop_loss ? String(pos.stop_loss) : "" };
  const [tp, setTp] = useState(init.tp);
  const [sl, setSl] = useState(init.sl);
  const [msg, setMsg] = useState("");
  const dirty = tp !== init.tp || sl !== init.sl;
  return (
    <tr>
      <td>
        <span className="ticker">{pos.investing_symbol}</span>
        <div className="small muted">{pos.name} · {pos.exchange} · {pos.currency}</div>
      </td>
      <td className="num">{pos.quantity}</td>
      <td className="num">{live ? <>{money(live.market_value_base, ccy)}<div className="small muted">{pct(live.weight)} {L("portfelin", "of the portfolio")}</div></> : "—"}</td>
      <td className={`num ${live ? (live.unrealized >= 0 ? "pos" : "neg") : ""}`}>
        {live ? <>{money(live.unrealized, ccy, { sign: true })}<div className="small">{pct(live.unrealized_pct, { sign: true })}</div></> : "—"}
      </td>
      <td><input aria-label={t("target")} inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} style={{ width: 96 }} placeholder="—" /></td>
      <td><input aria-label={t("stopLoss")} inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} style={{ width: 96 }} placeholder="—" /></td>
      <td>
        <button
          className={dirty ? "primary" : undefined}
          disabled={!dirty}
          title={dirty ? undefined : L("Hədəf və ya stop-loss dəyişəndə aktiv olur", "Becomes active when the target or stop-loss changes")}
          onClick={async () => {
            try {
              await api.put(`/api/portfolios/${pid}/targets`, {
                instrument_id: pos.instrument_id,
                target_price: tp ? Number(tp.replace(",", ".")) : null,
                stop_loss: sl ? Number(sl.replace(",", ".")) : null,
              });
              setMsg("✓");
              onSaved();
            } catch (err) {
              setMsg(`✕ ${(err as Error).message}`);
            }
          }}
        >
          {t("save")}
        </button>{" "}
        <span className="small">{msg}</span>
      </td>
    </tr>
  );
}
