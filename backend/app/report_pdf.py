"""Client PDF report of a finished run (investment view, risk view, positions and lots, recommendations).

Built only from the client run view (client_run_view), so it contains exactly what the client may see:
no test statistics, p-values or model parameters. Charts are drawn with PDF primitives (no plotting library)."""
from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Any

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from app.config import get_settings

# palette (matches the light UI theme)
INK = (21, 27, 40)
MUTED = (95, 104, 120)
LINE = (227, 230, 236)
SOFT = (240, 242, 246)
BLUE = (37, 88, 217)
BAND90 = (205, 217, 247)
BAND50 = (150, 176, 238)
NEG = (196, 80, 26)
POS = (31, 111, 178)
OK = (23, 120, 74)
WARN = (150, 88, 0)
ERR = (180, 35, 24)
RAG = {"green": OK, "amber": WARN, "red": ERR, "none": MUTED}
RAG_WORD = {"green": "normal", "amber": "diqqət", "red": "kritik", "none": "məlumat"}
REL_WORD = {"high": "yüksək", "medium": "orta", "low": "aşağı", "checking": "yoxlanılır"}
SYM = {"USD": "$", "EUR": "€", "GBP": "£", "AZN": "₼"}


# ---------------------------------------------------------------- formatting (same rules as the UI)
def pct(x: float | None, sign: bool = False) -> str:
    if x is None or not math.isfinite(x):
        return "—"
    s = f"{abs(x) * 100:.1f}%".replace(".", ",")
    return ("−" if x < 0 else "+" if sign and x > 0 else "") + s


def prob(x: float | None) -> str:
    if x is None or not math.isfinite(x):
        return "—"
    if x < 0.01:
        return "<1%"
    if x > 0.99:
        return ">99%"
    return f"{round(x * 100)}%"


def money(x: float | None, ccy: str, sign: bool = False) -> str:
    if x is None or not math.isfinite(x):
        return "—"
    v = x
    if abs(v) >= 1000:
        mag = 10 ** (int(math.floor(math.log10(abs(v)))) - 2)
        v = round(v / mag) * mag
        body = f"{abs(v):,.0f}".replace(",", " ")
    elif abs(v) < 100 and v != int(v):
        body = f"{abs(v):.2f}".replace(".", ",")
    else:
        body = f"{abs(v):,.0f}".replace(",", " ")
    sg = "−" if v < 0 else "+" if sign and v > 0 else ""
    return f"{sg}{body} {SYM.get(ccy, ccy)}"


def num(x: float | None, digits: int = 2) -> str:
    if x is None or not math.isfinite(x):
        return "—"
    return f"{x:.{digits}f}".replace(".", ",").replace("-", "−")


def date_az(iso: str | None) -> str:
    if not iso:
        return "—"
    y, m, d = iso[:10].split("-")
    return f"{d}.{m}.{y}"


def _font(paths: list[str]) -> str:
    for p in paths:
        if Path(p).is_file():
            return p
    raise RuntimeError("PDF üçün Unicode şrift tapılmadı (config.yaml → report.font_regular / font_bold).")


# ---------------------------------------------------------------- document
class Report(FPDF):
    def __init__(self, title: str, subtitle: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        cfg = get_settings()["report"]
        self.add_font("Body", "", _font(cfg["font_regular"]))
        self.add_font("Body", "B", _font(cfg["font_bold"]))
        self.set_auto_page_break(True, margin=16)
        self.set_margins(14, 14, 14)
        self.doc_title, self.doc_subtitle = title, subtitle
        self.set_title(title)
        self.set_creator("Portfel Analizi")

    @property
    def width(self) -> float:
        return self.w - self.l_margin - self.r_margin

    def header(self) -> None:
        self.set_font("Body", "B", 9)
        self.set_text_color(*MUTED)
        self.cell(self.width / 2, 5, self.doc_title)
        self.cell(self.width / 2, 5, self.doc_subtitle, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(*LINE)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.ln(5)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Body", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 5, f"Səhifə {self.page_no()} / {{nb}} · Bu, investisiya məsləhəti deyil; nəticələr zəmanət deyil, ehtimaldır.",
                  align="C")

    # -- building blocks --------------------------------------------------------------
    def section(self, text: str, min_room: float = 70) -> None:
        """Major section: starts a new page only when less than min_room mm is left (no near-empty pages)."""
        if self.get_y() > self.h - self.b_margin - min_room:
            self.add_page()
        else:
            self.ln(6)
        self.h1(text)

    def h1(self, text: str) -> None:
        self.set_font("Body", "B", 20)
        self.set_text_color(*INK)
        self.multi_cell(0, 9, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def h2(self, text: str, top: float = 4) -> None:
        self.ln(top)
        if self.get_y() > self.h - 40:
            self.add_page()
        self.set_font("Body", "B", 13)
        self.set_text_color(*INK)
        self.cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(1)

    def para(self, text: str, size: float = 10, color: tuple = INK) -> None:
        self.set_font("Body", "", size)
        self.set_text_color(*color)
        self.multi_cell(0, size * 0.5, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def tiles(self, items: list[tuple[str, str, str]]) -> None:
        """Big numbers in boxes: (label, value, sub)."""
        n = len(items)
        gap = 3
        w = (self.width - gap * (n - 1)) / n
        x0, y0 = self.l_margin, self.get_y()
        h = 26
        for i, (label, value, sub) in enumerate(items):
            x = x0 + i * (w + gap)
            self.set_fill_color(*SOFT)
            self.rect(x, y0, w, h, style="F")
            self.set_fill_color(*BLUE)
            self.rect(x, y0, w, 1.2, style="F")
            self.set_xy(x + 3, y0 + 3)
            self.set_font("Body", "", 8.5)
            self.set_text_color(*MUTED)
            self.cell(w - 6, 4, label)
            self.set_xy(x + 3, y0 + 8.5)
            self.set_font("Body", "B", 14 if len(value) <= 14 else 11)
            self.set_text_color(*INK)
            self.cell(w - 6, 7, value)
            self.set_xy(x + 3, y0 + 17)
            self.set_font("Body", "", 7.5)
            self.set_text_color(*MUTED)
            self.multi_cell(w - 6, 3.4, sub)
        self.set_xy(x0, y0 + h + 3)

    def bullets(self, memo: list[dict[str, str]]) -> None:
        colors = {"good": OK, "warn": WARN, "bad": ERR, "info": BLUE}
        for m in memo:
            y = self.get_y()
            if y > self.h - 30:
                self.add_page()
                y = self.get_y()
            self.set_fill_color(*colors.get(m.get("tone", "info"), BLUE))
            self.ellipse(self.l_margin + 0.5, y + 1.6, 2.2, 2.2, style="F")
            self.set_xy(self.l_margin + 5, y)
            self.set_font("Body", "", 10)
            self.set_text_color(*INK)
            self.multi_cell(self.width - 5, 5, m["text"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.ln(1)

    def table(self, head: list[str], rows: list[list[Any]], widths: list[float], align: str | None = None,
              colors: list[list[tuple | None]] | None = None, size: float = 8.5) -> None:
        """Simple table; align is a string of L/R per column; colors optionally per cell."""
        total = sum(widths)
        widths = [w * self.width / total for w in widths]
        align = align or "L" + "R" * (len(head) - 1)
        lh = size * 0.55

        def row(cells: list[Any], bold: bool, fill: tuple | None, cell_colors: list | None = None) -> None:
            if self.get_y() > self.h - 22:
                self.add_page()
                if not bold:  # a table continued on a new page repeats its header row
                    row(head, True, SOFT)
            if fill:
                self.set_fill_color(*fill)
                self.rect(self.l_margin, self.get_y(), self.width, lh + 2.4, style="F")
            y = self.get_y() + 1.2
            x = self.l_margin
            self.set_font("Body", "B" if bold else "", size)
            for i, (c, w) in enumerate(zip(cells, widths)):
                col = (cell_colors[i] if cell_colors else None) or (MUTED if bold else INK)
                self.set_text_color(*col)
                self.set_xy(x + 1, y)
                text = str(c)
                while self.get_string_width(text) > w - 2 and len(text) > 1:
                    text = text[:-2] + "…"
                self.cell(w - 2, lh, text, align=align[i])
                x += w
            self.set_xy(self.l_margin, y + lh + 1.2)
            self.set_draw_color(*LINE)
            self.line(self.l_margin, self.get_y(), self.l_margin + self.width, self.get_y())

        row(head, True, SOFT)
        for k, r in enumerate(rows):
            row(r, False, None, colors[k] if colors else None)
        self.ln(2)

    def bar(self, label: str, share: float, color: tuple, right: str) -> None:
        """One horizontal bar with a marker at 100% (e.g. risk-limit use)."""
        self.set_font("Body", "", 9.5)
        self.set_text_color(*INK)
        self.multi_cell(0, 5, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        y = self.get_y()
        x = self.l_margin
        w = self.width * 0.85
        scale = max(1.25, share * 1.1)
        self.set_fill_color(*SOFT)
        self.rect(x, y + 1.5, w, 3, style="F")
        self.set_fill_color(*color)
        self.rect(x, y + 1.5, w * min(1.0, share / scale), 3, style="F")
        self.set_draw_color(*INK)
        self.line(x + w / scale, y + 0.5, x + w / scale, y + 5.5)
        self.set_xy(x + w + 2, y)
        self.set_font("Body", "B", 9.5)
        self.cell(self.width * 0.15 - 2, 6, right, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def fan_chart(self, res: dict[str, Any], height: float = 62) -> None:
        """Past value line and the 90% / 50% bands with the median of the forecast."""
        ccy = res["base_currency"]
        hist = res["history"]["values"][-int(get_settings()["report"]["history_days"]):]
        fan = res["fan"]  # H x [p05, p25, p50, p75, p95]
        vals = hist + [v for r in fan for v in (r[0], r[4])] + [res["cost_total"]]
        lo, hi = min(vals), max(vals)
        pad = (hi - lo) * 0.06 or 1
        lo, hi = lo - pad, hi + pad
        n = len(hist) + len(fan)
        x0, y0 = self.l_margin + 18, self.get_y() + 2
        w, h = self.width - 20, height
        X = lambda i: x0 + w * i / max(n - 1, 1)  # noqa: E731
        Y = lambda v: y0 + h * (1 - (v - lo) / (hi - lo))  # noqa: E731
        self.set_draw_color(*LINE)
        self.set_font("Body", "", 7)
        self.set_text_color(*MUTED)
        for k in range(5):
            v = lo + (hi - lo) * k / 4
            self.line(x0, Y(v), x0 + w, Y(v))
            self.set_xy(self.l_margin, Y(v) - 2)
            self.cell(17, 4, money(v, ccy), align="R")
        off = len(hist) - 1 if hist else 0
        for band, (a, b) in ((BAND90, (0, 4)), (BAND50, (1, 3))):
            up = [(X(off + 1 + i), Y(r[b])) for i, r in enumerate(fan)]
            dn = [(X(off + 1 + i), Y(r[a])) for i, r in enumerate(fan)][::-1]
            if hist:
                up = [(X(off), Y(hist[-1]))] + up
                dn = dn + [(X(off), Y(hist[-1]))]
            self.set_fill_color(*band)
            self.polygon(up + dn, style="F")
        self.set_line_width(0.45)
        self.set_draw_color(*INK)
        for i in range(1, len(hist)):
            self.line(X(i - 1), Y(hist[i - 1]), X(i), Y(hist[i]))
        self.set_draw_color(*BLUE)
        med = ([(X(off), Y(hist[-1]))] if hist else []) + [(X(off + 1 + i), Y(r[2])) for i, r in enumerate(fan)]
        for (xa, ya), (xb, yb) in zip(med, med[1:]):
            self.line(xa, ya, xb, yb)
        self.set_line_width(0.25)
        self.set_draw_color(*WARN)
        self.dashed_line(x0, Y(res["cost_total"]), x0 + w, Y(res["cost_total"]), 1.2, 1.2)
        if hist:
            self.set_draw_color(*MUTED)
            self.line(X(off), y0, X(off), y0 + h)
        self.set_y(y0 + h + 2)
        self.set_font("Body", "", 7.5)
        self.set_text_color(*MUTED)
        self.multi_cell(0, 3.6, "Qara — son 6 ayın faktiki dəyəri (cari say ilə); açıq zolaq — 90% aralıq, tünd zolaq — 50% aralıq, "
                        "göy xətt — median (proqnoz qiymət deyil); narıncı qırıq xətt — maya dəyəri.",
                        new_x=XPos.LMARGIN, new_y=YPos.NEXT)


# ---------------------------------------------------------------- content
def _var_at(q: list[float | None] | None, res: dict[str, Any], level: float) -> tuple[float, float] | None:
    r = res["risk"].get(str(level))
    if r:
        return r["var_pct"], r["cvar_pct"]
    if not q:
        return None
    k = int(round((1 - level) * 1000))
    tail = q[:k]
    if k < 1 or any(v is None for v in tail):
        return None
    return -tail[-1], -sum(tail) / len(tail)


def build_pdf(view: dict[str, Any], portfolio_name: str) -> bytes:
    res = view["result"]
    ccy = res["base_currency"]
    ins = res.get("insights") or {}
    inv, rk = ins.get("investment") or {}, ins.get("risk") or {}
    im, rm = inv.get("metrics") or {}, rk.get("metrics") or {}
    end = res["checkpoints"][-1]
    rel = REL_WORD.get(view.get("reliability"), view.get("reliability", ""))
    pdf = Report(f"Portfel Analizi · {portfolio_name}", f"{date_az(res['as_of'])} → {date_az(res['horizon_end'])}")
    pdf.alias_nb_pages()

    # ---- page 1: investment
    pdf.add_page()
    pdf.h1(f"{portfolio_name}: 3 aylıq təhlil")
    pdf.para(f"Məlumat tarixi {date_az(res['as_of'])} · dövrün sonu {date_az(res['horizon_end'])} ({res['horizon_days']} ticarət günü) · "
             f"valyuta {ccy} · {res['scenarios']:,} ssenari · etibarlılıq: {rel}".replace(",", " "), 9, MUTED)
    pdf.ln(3)
    total = res["current"]["total"]
    pdf.tiles([
        ("Portfelin dəyəri", money(res["V0"], ccy), f"cari m/z {money(total['unrealized'], ccy, True)} ({pct(total['unrealized_pct'], True)})"),
        ("Gözlənilən gəlir", pct(im.get("expected_return"), True) if im else money(res["pnl_end"]["median"], ccy, True),
         f"{money(im.get('expected_money'), ccy, True)} — bazar riskinin mükafatı" if im else "m/z medianı"),
        ("10 ssenaridən 9-u", f"{money(end['p05'], ccy)} – {money(end['p95'], ccy)}", "dövrün sonunda dəyər"),
        ("Mənfəətdə bitmə", prob(res["pnl_end"]["prob_profit"]), "maya dəyərindən yuxarı"),
    ])
    if inv.get("memo"):
        pdf.h2("İnvestisiya brifinqi (CIO)", 1)
        pdf.bullets(inv["memo"])
    pdf.h2("Portfelin dəyəri: harada olacağam?")
    pdf.fan_chart(res)
    if im:
        pdf.h2("Əsas göstəricilər")
        rows = [
            ["Sharpe (illik) / Sortino", f"{num(im.get('sharpe'))} / {num(im.get('sortino'))}",
             "Bazar həssaslığı (β)", num(im.get("market_sensitivity"))],
            ["Gəlir / CVaR 95%", num(im.get("return_to_cvar")), "Diversifikasiya faydası", pct(im.get("diversification_benefit"))],
            ["Qazanc / itki nisbəti", num(im.get("gain_loss_ratio")), "Effektiv səhm sayı", num(im.get("effective_n"), 1)],
            ["Depozitdən çox qazanma ehtimalı", prob(im.get("prob_beat_rf")), "Bazar riski / şirkətə xas risk",
             f"{pct(im.get('systematic_share'))} / {pct(im.get('specific_share'))}"],
            ["Yaxşı ssenari (95%)", money(im.get("best_case_money"), ccy, True), "Volatillik (illik)", pct(im.get("vol_annual"))],
        ]
        pdf.table(["Göstərici", "Dəyər", "Göstərici", "Dəyər"], rows, [34, 16, 34, 16], "LRLR")

    # ---- risk
    pdf.section("Risk")
    if rm.get("limit_use") is not None:
        use = rm["limit_use"]
        color = ERR if use > 1 else WARN if use > get_settings()["insights"]["limit_use_amber"] else OK
        pdf.bar(f"Risk limitindən istifadə (CVaR 95% {pct(rm['cvar95'])} / limit {pct(rm['limit'])})", use, color, pct(use))
        pdf.ln(2)
    if rk.get("memo"):
        pdf.h2("Risk brifinqi (CRO)", 1)
        pdf.bullets(rk["memo"])
    pdf.h2("VaR / CVaR nərdivanı (3 ay)")
    ladder = []
    for lv in (0.9, 0.95, 0.975, 0.99):
        vc = _var_at(rk.get("quantiles"), res, lv)
        if vc:
            n = round(1 / (1 - lv))
            ladder.append([pct(lv).replace(",0%", "%"), pct(vc[0]), money(vc[0] * res["V0"], ccy), pct(vc[1]),
                           money(vc[1] * res["V0"], ccy), f"hər {n} rübdən 1-də"])
    pdf.table(["Səviyyə", "VaR", "VaR, məbləğ", "CVaR", "CVaR, məbləğ", "Tezlik"], ladder, [14, 12, 18, 12, 18, 22], "LRRRRL")
    if rk.get("kri"):
        pdf.h2("Əsas risk göstəriciləri (svetofor)")
        order = {"red": 0, "amber": 1, "green": 2, "none": 3}
        kri = sorted(rk["kri"], key=lambda k: order.get(k["status"], 3))
        rows, colors = [], []
        for k in kri:
            v = k["value"]
            val = "—" if v is None else (pct(v) if k["kind"] == "pct" else prob(v) if k["kind"] == "prob" else
                                         f"{num(v)}×" if k["kind"] == "times" else
                                         ("<0,1 gün" if v < 0.1 else f"{num(v, 1)} gün") if k["kind"] == "days" else num(v))
            rows.append([k["label"], val, RAG_WORD.get(k["status"], ""), k.get("hint", "")])
            colors.append([None, None, RAG.get(k["status"], MUTED), MUTED])
        pdf.table(["Göstərici", "Dəyər", "Status", "Şərh"], rows, [38, 11, 10, 41], "LRLL", colors, size=8)
    if res.get("stress"):
        pdf.h2("Stress testləri (ssenaridir, ehtimal deyil)")
        rows = [[s["name"], "tarixi" if s["type"] == "historical" else "hipotetik", money(s["pnl_money"], ccy, True),
                 pct(-s["loss_pct"], True)] for s in sorted(res["stress"], key=lambda s: -s["loss_money"])]
        pdf.table(["Ssenari", "Növ", "Portfel", "%"], rows, [40, 16, 22, 14], "LLRR")
    pdf.h2("Model nə qədər etibarlıdır?")
    pdf.para(f"Ümumi etibarlılıq: {rel}. {view.get('reliability_text', '')}", 9.5)
    tr = view.get("trust")
    if tr and tr.get("var95"):
        pdf.para(f"Son {tr['backtest_days']} ticarət günündə gündəlik VaR 95% {tr['var95']['observed']} dəfə aşılıb "
                 f"(gözlənilən ~{num(tr['var95']['expected'], 1)}); {tr['checks_passed']} / {tr['checks_total']} statistik yoxlamadan keçib.",
                 9.5, MUTED)

    # ---- positions, lots, recommendations
    pdf.section("Mövqelər")
    eff = {p["symbol"]: p for p in inv.get("positions", [])}
    rows = []
    for p in res["current"]["positions"]:
        a = next((x for x in res["assets"] if x["symbol"] == p["symbol"]), None)
        e = eff.get(p["investing_symbol"], {})
        rows.append([p["investing_symbol"], num(p["quantity"], 4).rstrip("0").rstrip(","), money(p["market_value_base"], ccy),
                     pct(p["weight"]), money(p["unrealized"], ccy, True), pct(e.get("expected_return"), True),
                     f"{pct(a['end']['p05'] / a['price0'] - 1, True)} … {pct(a['end']['p95'] / a['price0'] - 1, True)}" if a else "—",
                     prob(a["prob_up"]) if a else "—", pct(e.get("risk_share"))])
    pdf.table(["Səhm", "Say", "Dəyər", "Çəki", "Cari m/z", "Gözl. gəlir", "90% aralıq", "Qalxma", "Risk payı"], rows,
              [12, 8, 13, 9, 13, 11, 20, 9, 10], "LRRRRRRRR", size=8)
    lots = [(p, lot) for p in res["current"]["positions"] for lot in p.get("lots", [])]
    if lots:
        pdf.h2("Alış tarixinə görə mənfəət/zərər")
        rows, colors = [], []
        for p, lot in lots:
            f = lot.get("forecast") or {}
            rows.append([p["investing_symbol"], date_az(lot["trade_date"]), num(lot["quantity"], 4).rstrip("0").rstrip(","),
                         money(lot["cost_base"], ccy), money(lot["unrealized"], ccy, True), pct(lot["unrealized_pct"], True),
                         pct(lot.get("annualized_return"), True) if lot.get("annualized_return") is not None else "—",
                         money(f.get("median"), ccy, True), f"{money(f.get('p05'), ccy, True)} … {money(f.get('p95'), ccy, True)}",
                         prob(f.get("prob_profit"))])
            colors.append([None, MUTED, None, None, NEG if lot["unrealized"] < 0 else POS, NEG if lot["unrealized"] < 0 else POS,
                           None, None, None, None])
        pdf.table(["Səhm", "Alış", "Say", "Maya", "Cari m/z", "%", "İllik", "Təxm. m/z", "90% aralıq", "Mənfəət ehtim."],
                  rows, [9, 11, 6, 10, 11, 8, 8, 11, 19, 9], "LLRRRRRRRR", colors, size=7.5)
        pdf.para("Təxmini m/z — alışın öz maya dəyərinə nisbətən dövrün sonundakı mənfəət/zərər (median və 90% aralıq).", 7.5, MUTED)
    recs = view.get("recommendations") or []
    if recs:
        pdf.h2("Tövsiyələr")
        words = {"reduce": "AZALT", "increase": "ARTIR", "hold": "SAXLA", "attention": "DİQQƏT"}
        for r in recs:
            pdf.set_font("Body", "B", 10)
            pdf.set_text_color(*INK)
            pdf.multi_cell(0, 5, f"{words.get(r['action'], r['action'])}: {r.get('name') or r.get('symbol') or ''}",
                           new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.para(r["reason"], 9.5)
            pdf.ln(1)
    pdf.ln(2)
    pdf.para(view.get("disclaimer") or "", 8.5, MUTED)
    pdf.para(f"Hazırlanıb: {datetime.now():%d.%m.%Y %H:%M} · Portfel Analizi", 8, MUTED)
    return bytes(pdf.output())
