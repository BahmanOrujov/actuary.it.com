import { ChartCard, axisStyle, baseOption } from "../components/Chart";
import { signClass } from "../components/ResultSections";
import { dateAz, money, pct } from "../format";
import { L } from "../lang";
import { Hero, OlderRun, useResult } from "./Results";

/** "Today": what the current holdings are worth and what they actually did on their own past prices. No model. */

function Since({ since, windows }: { since: string | null; windows?: number }) {
  return (
    <p className="small muted">
      {L("Bugünkü tərkib keçmiş qiymətlərlə ölçülür (alış tarixinizdən asılı deyil)", "Today's holdings measured on past prices (regardless of when you bought them)")}
      {since ? L(`; tarixçə ${dateAz(since)}-dən`, `; history from ${dateAz(since)}`) : ""}
      {windows ? L(`; ${windows} keçmiş 3 aylıq dövr`, `; ${windows} past 3-month periods`) : ""}. {L("Keçmiş gələcəyə zəmanət deyil.", "The past is no guarantee.")}
    </p>
  );
}

export function TodayInvestment() {
  const r = useResult();
  if ("empty" in r) return r.empty;
  const { res } = r;
  const a = res.actual;
  const ccy = res.base_currency;
  const t = res.current.total;
  const stat = (sym: string) => a?.assets?.find((x) => x.symbol === sym);
  const rows = [...res.current.positions].sort((x, y) => y.market_value_base - x.market_value_base);

  return (
    <>
      {!a && <OlderRun />}
      <Hero items={[
        { label: L("Portfelin dəyəri", "Portfolio value"), value: money(res.V0, ccy), sub: `${L("maya dəyəri", "cost")} ${money(t.cost, ccy)}` },
        { label: L("Cari mənfəət / zərər", "Current profit / loss"), value: money(t.unrealized, ccy, { sign: true }),
          sub: pct(t.unrealized_pct, { sign: true }), tone: t.unrealized < 0 ? "neg" : "pos" },
        { label: L("Son 3 ay", "Last 3 months"), value: pct(a?.return_period, { sign: true }),
          sub: a?.return_period != null ? money(a.return_period * res.V0, ccy, { sign: true }) : undefined, tone: (a?.return_period ?? 0) < 0 ? "neg" : "pos" },
        { label: L("Son 1 il", "Last year"), value: pct(a?.return_year, { sign: true }),
          sub: `${L("reallaşmış", "realised")} ${money(t.realized, ccy, { sign: true })} · ${L("dividend", "dividends")} ${money(t.dividends ?? 0, ccy)}`,
          tone: (a?.return_year ?? 0) < 0 ? "neg" : "pos" },
      ]} />

      <ChartCard
        title={L("Portfelin dəyəri: keçmiş", "Portfolio value: the past")}
        subtitle={L("Bugünkü səhmlər keçmişdə saxlansaydı, dəyəri belə olardı.", "What today's holdings would have been worth in the past.")}
        ariaLabel={L("Bugünkü tərkibin keçmiş dəyəri, xətt qrafiki", "Past value of today's holdings, line chart")}
        deps={[res.history.dates.length, res.V0]}
        build={(p) => ({
          ...baseOption(p),
          xAxis: { type: "category", data: res.history.dates.map(dateAz), ...axisStyle(p) },
          yAxis: { type: "value", scale: true, ...axisStyle(p), axisLabel: { ...axisStyle(p).axisLabel, formatter: (v: number) => money(v, ccy) } },
          tooltip: { ...baseOption(p).tooltip, trigger: "axis", valueFormatter: (v) => money(Number(v), ccy) },
          series: [{ type: "line", data: res.history.values, showSymbol: false, lineStyle: { color: p.q, width: 2 }, itemStyle: { color: p.q } }],
        })}
        table={(
          <table>
            <thead><tr><th>{L("Tarix", "Date")}</th><th className="num">{L("Dəyər", "Value")}</th></tr></thead>
            <tbody>{res.history.dates.map((d, i) => <tr key={d}><td>{dateAz(d)}</td><td className="num">{money(res.history.values[i], ccy)}</td></tr>)}</tbody>
          </table>
        )}
      />

      <section className="card">
        <h2>{L("Mövqelər bu gün", "Positions today")}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L("Səhm", "Stock")}</th><th className="num">{L("Çəki", "Weight")}</th><th className="num">{L("Maya → dəyər", "Cost → value")}</th>
                <th className="num">{L("Cari m/z", "Current P/L")}</th><th className="num">{L("Son 3 ay", "Last 3 months")}</th><th className="num">{L("Son 1 il", "Last year")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const s = stat(x.symbol);
                return (
                  <tr key={x.symbol}>
                    <td><span className="ticker">{x.investing_symbol}</span><div className="small muted">{x.name}</div></td>
                    <td className="num">{pct(x.weight)}</td>
                    <td className="num">{money(x.cost_base, ccy)} → {money(x.market_value_base, ccy)}</td>
                    <td className={`num ${signClass(x.unrealized)}`}>{money(x.unrealized, ccy, { sign: true })}<div className="small">{pct(x.unrealized_pct, { sign: true })}</div></td>
                    <td className={`num ${signClass(s?.return_period ?? 0)}`}>{pct(s?.return_period, { sign: true })}</td>
                    <td className={`num ${signClass(s?.return_year ?? 0)}`}>{pct(s?.return_year, { sign: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {res.current.closed.length > 0 && (
          <p className="small muted" style={{ marginTop: 10 }}>
            {L("Bağlanmış mövqelər", "Closed positions")}: {res.current.closed.map((c) => `${c.name} ${money(c.realized + c.dividends, res.base_currency, { sign: true })}`).join(" · ")}
          </p>
        )}
        <Since since={a?.since ?? null} />
      </section>
      <p className="disclaimer" role="note">{r.run.disclaimer}</p>
    </>
  );
}

export function TodayRisk() {
  const r = useResult();
  if ("empty" in r) return r.empty;
  const { res } = r;
  const a = res.actual;
  const ccy = res.base_currency;
  const limit = res.risk_limit;
  const over = a?.cvar95_pct != null && limit != null && a.cvar95_pct > limit;
  const rows = [...(a?.assets ?? [])].sort((x, y) => y.weight - x.weight);
  const pos = (sym: string) => res.current.positions.find((x) => x.symbol === sym);

  return (
    <>
      {!a && <OlderRun />}
      <Hero items={[
        { label: L("Pis 3 ay (CVaR 95%)", "A bad 3 months (CVaR 95%)"), value: a?.cvar95_pct != null ? pct(-a.cvar95_pct) : "—",
          sub: a?.cvar95_pct != null ? `${money(-a.cvar95_pct * res.V0, ccy)} · limit ${pct(limit)}` : L("tarixçə qısadır", "history too short"), tone: over ? "neg" : undefined },
        { label: L("Ən pis 3 ay", "Worst 3 months"), value: pct(a?.worst_period), sub: L("keçmiş dövrlərin ən pisi", "the worst past period"), tone: "neg" },
        { label: L("Ən böyük düşüş", "Largest fall"), value: pct(a?.max_drawdown), sub: L("zirvədən, son 1 il", "from a peak, last year"), tone: "neg" },
        { label: L("Dəyişkənlik (illik)", "Volatility (annual)"), value: pct(a?.vol_annual), sub: L("son 1 il", "last year") },
      ]} />
      <section className="card">
        <h2>{L("Risk haradan gəlir", "Where the risk comes from")}</h2>
        <p className="small muted">{L("Riskin payı — keçmişin ən pis 3 aylıq dövrlərindəki itkinin hansı hissəsini bu səhm verib. Payı çəkisindən xeyli böyükdürsə, portfelə öz ölçüsündən çox risk gətirir; mənfi pay — o dövrlərdə itkini azaldıb (sığorta kimi).",
          "Share of risk — how much of the loss in the worst past 3-month periods came from this stock. A share well above the weight means it brings more risk than its size; a negative share means it reduced the loss in those periods (like a hedge).")}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L("Səhm", "Stock")}</th><th className="num">{L("Çəki", "Weight")}</th><th className="num">{L("Riskin payı", "Share of risk")}</th>
                <th className="num">{L("Dəyişkənlik", "Volatility")}</th><th className="num">{L("Ən böyük düşüş", "Largest fall")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const p = pos(x.symbol);
                return (
                  <tr key={x.symbol}>
                    <td><span className="ticker">{p?.investing_symbol ?? x.symbol}</span><div className="small muted">{p?.name}</div></td>
                    <td className="num">{pct(x.weight)}</td>
                    <td className="num">{pct(x.cvar_share)}</td>
                    <td className="num">{pct(x.vol_annual)}</td>
                    <td className="num neg">{pct(x.max_drawdown)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} className="muted">{L("Generate basın.", "Press Generate.")}</td></tr>}
            </tbody>
          </table>
        </div>
        <Since since={a?.since ?? null} windows={a?.windows} />
      </section>
      <p className="disclaimer" role="note">{r.run.disclaimer}</p>
    </>
  );
}
