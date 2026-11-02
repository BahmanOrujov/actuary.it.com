"""Admin report (HTML + JSON) in <reports dir>/<portfolio_id>/<run_id>/ (outside OneDrive by default) (PROMPT.md 6.10)."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from jinja2 import Environment, select_autoescape
from markupsafe import Markup, escape

from app.config import get_settings


def _clean(o: Any) -> Any:
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return f if math.isfinite(f) else None
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return _clean(o.tolist())
    if hasattr(o, "isoformat"):
        return o.isoformat()
    return o


def interpret(r: dict[str, Any], alpha: float) -> str:
    """Short Azerbaijani interpretation of a test result for the admin report ("şərh")."""
    name = (r.get("name") or "").lower()
    p = r.get("p_holm") if r.get("p_holm") is not None else r.get("q_value") if r.get("q_value") is not None else r.get("p_value")
    eff = r.get("effect") or {}
    if p is None:
        return "Hesablanmadı (müşahidə azdır və ya qiymətləndirmə alınmadı)."
    rej = p < alpha
    keep = "Rədd edilmədi: bu, H0-ın doğru olduğunu sübut etmir, yalnız ziddiyyətli dəlil tapılmadı."
    if "kupiec" in name:
        rate, nom = eff.get("rate"), eff.get("nominal")
        if rate is not None and nom:
            side = "riski çox qiymətləndirir (aşım azdır)" if rate < nom else "riski az qiymətləndirir (aşım çoxdur)"
            return (f"Faktiki aşım {rate:.2%}, nominal {nom:.2%}. " + (f"Model {side}." if rej else keep))
    if "müstəqillik" in name:
        return "Aşımlar klasterləşir: VaR şoklardan sonra kifayət qədər tez yüksəlmir." if rej else keep
    if "şərti əhatə" in name:
        return "Əhatə və ya müstəqillik pozulur." if rej else keep
    if "dq" in name or "dynamic" in name:
        return "Aşımlar keçmiş məlumatla proqnozlaşdırıla bilir: VaR dinamikası çatışmır." if rej else keep
    if "mcneil" in name or "acerbi" in name or "z2" in name:
        return "Pis günlərdə itki ES-dən dərindir: ES aşağı qiymətləndirilir." if rej else keep
    if name.endswith("(pit)"):  # residual goodness of fit of the GARCH innovation distribution
        return "Seçilmiş paylanma qalıqlara uyğun deyil (FHS empirik qalıqları istifadə edir)." if rej else keep
    if "berkowitz" in name or name.startswith("pit "):
        return "Sıxlıq proqnozu kalibrlənməyib (yer, miqyas və ya asılılıq)." if rej else keep
    if "əhatəsi" in name or "coverage" in name:
        cov, nom = eff.get("coverage"), eff.get("nominal")
        txt = f"Faktiki əhatə {cov:.0%}, nominal {nom:.0%}. " if cov is not None and nom is not None else ""
        return txt + ("Aralıqlar kalibrlənməyib." if rej else keep + " Üst-üstə düşən pəncərələrdə güc aşağıdır.")
    if "ljung-box z²" in name or "ljung-box r²" in name:
        return ("Kvadratlarda avtokorrelyasiya var: volatillik klasterləşir" +
                (" və model onu tam tutmur." if "z²" in name else " (GARCH-ı əsaslandırır).")) if rej else keep
    if "ljung-box" in name:
        return "Avtokorrelyasiya var (orta tənlik və ya qalıqlar)." if rej else keep
    if "arch-lm" in name:
        return "ARCH effekti var: şərti heteroskedastiklik modelləşdirilməlidir." if rej else "ARCH effekti tapılmadı."
    if "engle-ng" in name:
        return "Asimmetriya (leverage) qalıqlarda qalıb." if rej else keep
    if "jarque" in name or name == "anderson-darling":
        return "Gəlirlər normal deyil; model normal paylanma fərz etmir." if rej else keep
    if "lr: gjr" in name:
        return "Asimmetriya parametri γ əhəmiyyətlidir." if rej else "γ = 0 rədd edilmədi; simmetrik model də uyğun ola bilər."
    if "engle-sheppard" in name:
        return "Korrelyasiya zamanla dəyişir → DCC." if rej else "Sabit korrelyasiya rədd edilmədi → CCC."
    if "hosking" in name:
        return "Korrelyasiyadan təmizlənmiş şoklarda çoxölçülü asılılıq qalıb." if rej else keep
    if "diebold" in name:
        d = eff.get("mean_loss_diff")
        if rej and d is not None:
            return "Əsas model rəqibdən statistik olaraq yaxşıdır." if d < 0 else "Rəqib model statistik olaraq yaxşıdır."
        return keep
    if "spa" in name:
        return "Ən azı bir rəqib model daha kiçik itki verir: model dəyişikliyi nəzərdən keçirilməlidir." if rej else keep
    if "mincer" in name:
        return "Volatillik proqnozu qərəzlidir (kəsişmə≠0 və ya meyl≠1)." if rej else keep
    if "qırılma" in name or "inclán" in name or "κ2" in name:
        return "Dispersiyada və ya parametrlərdə dəyişiklik var." if rej else keep
    if name in ("adf", "kpss"):
        return "Birgə şərh 'stasionarlıq' sətrindədir."
    return ("H0 rədd edildi." if rej else keep)


def _tests_table(rows: list[dict], alpha: float) -> str:
    if not rows:
        return ""

    def f(x: Any) -> str:
        return "—" if x is None else (f"{x:.4g}" if isinstance(x, float) else str(escape(x)))

    h = ["<table><tr><th>Test</th><th>H0</th><th>Statistika</th><th>p</th><th>q / Holm</th><th>Qərar</th>"
         "<th>Effekt</th><th>Şərh</th></tr>"]
    for r in rows:
        dec = "—" if r.get("reject") is None else ("rədd" if r["reject"] else "rədd edilmədi")
        cls = "bad" if r.get("reject") else ""
        adj = r.get("q_value") if r.get("q_value") is not None else r.get("p_holm")
        eff = ", ".join(f"{escape(k)}={f(v)}" for k, v in (r.get("effect") or {}).items() if not isinstance(v, (list, dict)))
        vs = f" vs {escape(r['vs'])}" if r.get("vs") else ""
        h.append(f"<tr><td>{escape(r.get('name') or '')}{vs}</td><td>{escape(r.get('h0') or '')}</td>"
                 f"<td>{f(r.get('statistic'))}</td><td>{f(r.get('p_value'))}</td><td>{f(adj)}</td>"
                 f"<td class='{cls}'>{dec}</td><td class='small'>{eff}</td>"
                 f"<td class='small'>{escape(interpret(r, alpha))} {escape(r.get('note') or '')}</td></tr>")
    h.append("</table>")
    return "".join(h)


def _qq_svg(points: list[list[float]] | None, size: int = 170) -> str:
    """PIT QQ-plot (uniform): nominal vs empirical quantiles with the 45° line."""
    if not points:
        return ""
    pad = 22
    span = size - 2 * pad

    def xy(a: float, b: float) -> tuple[float, float]:
        return pad + a * span, size - pad - b * span

    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in (xy(a, b) for a, b in points))
    x0, y0 = xy(0, 0)
    x1, y1 = xy(1, 1)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" role="img" aria-label="PIT QQ-plot">'
            f'<rect x="{pad}" y="{pad}" width="{span}" height="{span}" fill="none" stroke="currentColor" stroke-opacity=".25"/>'
            f'<line x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}" stroke="currentColor" stroke-opacity=".45" stroke-dasharray="3 3"/>'
            f'<polyline points="{pts}" fill="none" stroke="#2563eb" stroke-width="1.6"/>'
            f'<text x="{size / 2}" y="{size - 4}" font-size="9" text-anchor="middle" fill="currentColor">nominal</text>'
            f'<text x="8" y="{size / 2}" font-size="9" text-anchor="middle" fill="currentColor" '
            f'transform="rotate(-90 8 {size / 2})">PIT kvantili</text></svg>')


def _curve_table(rows: list[dict] | None) -> str:
    if not rows:
        return ""
    h = ["<table><tr><th>Nominal</th><th>Faktiki</th><th>95% zolaq</th><th></th></tr>"]
    for r in rows:
        ok = r["lo"] <= r["observed"] <= r["hi"] if r.get("observed") is not None else True
        h.append(f"<tr><td>{r['nominal']:.0%}</td><td>{r['observed']:.1%}</td><td>{r['lo']:.1%} – {r['hi']:.1%}</td>"
                 f"<td class='{'ok' if ok else 'bad'}'>{'✓' if ok else '✕'}</td></tr>")
    h.append("</table>")
    return "".join(h)


TEMPLATE = """<!doctype html><html lang="az"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin hesabatı — run {{ run_id }}</title>
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#5b6475;--line:#e3e6ec;--ok:#1a7f4b;--bad:#b42318;--warn:#a15c07}
@media (prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e6e9ef;--muted:#9aa3b2;--line:#2a303c;--ok:#4cc38a;--bad:#f97066;--warn:#f5b546}}
body{font:14px/1.5 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px;max-width:1240px}
h1{font-size:22px}h2{font-size:17px;margin-top:32px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:15px;margin-bottom:4px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.muted{color:var(--muted)}.small{font-size:12px}
code{font-size:12px}.flex{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
</style></head><body>
<h1>Admin hesabatı — portfel {{ portfolio_id }}, run {{ run_id }}</h1>
<p class="muted">Məlumat tarixi: {{ diag.as_of }} · Model versiyası: {{ diag.model_version }} · Seed: {{ diag.seed }} · Ssenari: {{ diag.mc.scenarios }} · Snapshot: {{ diag.fingerprint }}</p>

<h2>1. Yekun qərar</h2>
{% if val %}<p><b class="{{ 'ok' if val.verdict=='pass' else ('warn' if val.verdict=='conditional' else 'bad') }}">
{{ {'pass':'KEÇDİ','conditional':'ŞƏRTİ','fail':'KEÇMƏDİ'}[val.verdict] }}</b> — müştəri etibarlılığı (gate-lərə görə): {{ val.reliability }}</p>
{% if val.fallback_applied %}<p class="warn">Gate-lər keçilmədiyi üçün növbəti spesifikasiya ({{ val.fallback_applied.spec }}) sınandı və tətbiq olundu; əvvəlki qərar: {{ val.fallback_applied.previous_verdict }}, keçməyən gate-lər {{ val.fallback_applied.previous_failed_gates }}. İkinci cəhd Bonferroni ilə α = {{ val.fallback_applied.alpha }} səviyyəsində qiymətləndirildi (iki spesifikasiya sınağı təsadüfən keçmə ehtimalını artırır).</p>{% endif %}
{% if val.fallback_tried %}<p class="muted">Sınanmış alternativ: {{ val.fallback_tried.spec }} → {{ val.fallback_tried.verdict }} (daha yaxşı deyil, tətbiq olunmadı).</p>{% endif %}
{% else %}<p class="warn">Validasiya hələ bitməyib.</p>{% endif %}
{% if diag.reliability_cap %}<p class="warn">Etibarlılıq məhdudiyyəti (≤ {{ diag.reliability_cap }}): {{ diag.reliability_cap_reasons|join('; ') }}</p>{% endif %}

<h2>2. Gate-lər</h2>
{% if val %}<table><tr><th>#</th><th>Gate</th><th>Nəticə</th><th>Qeyd</th></tr>
{% for g in val.gates %}<tr><td>{{ g.id }}</td><td>{{ g.name }}</td>
<td class="{{ 'ok' if g['pass'] else ('muted' if g['pass'] is none else 'bad') }}">{{ 'keçdi' if g['pass'] else ('müəyyən deyil' if g['pass'] is none else 'keçmədi') }}{% if g.pass_after_conformal %} (conformal ilə keçdi){% endif %}{% if g.soft and not g['pass'] %} (yumşaq gate){% endif %}{% if g.pass_unadjusted is defined and g.pass_unadjusted is not none and g.pass_unadjusted != g['pass'] %} · düzəlişsiz: {{ 'keçdi' if g.pass_unadjusted else 'keçmədi' }}{% endif %}</td>
<td>{{ g.note or '' }} {% if g.detail %}<code>{{ g.detail }}</code>{% endif %}</td></tr>{% endfor %}</table>{% endif %}

<h2>3. Məlumatın keyfiyyəti</h2>
<table><tr><th>Simvol</th><th>Müşahidə</th><th>Dövr</th><th>İl</th><th>Boş iş günləri</th><th>Dublikat</th><th>Kənar gəlirlər</th><th>Şübhəli split</th><th>Ən uzun dəyişməz</th></tr>
{% for s,q in diag.data_quality.items() %}<tr><td>{{ s }}</td><td>{{ q.n_obs }}</td><td>{{ q.first_date }} – {{ q.last_date }}</td><td>{{ q.years }}</td><td>{{ q.missing_business_days }}</td><td>{{ q.duplicate_dates }}</td><td>{{ q.outlier_returns|length }}</td><td>{{ q.suspected_unadjusted_splits|join(', ') }}</td><td>{{ q.longest_stale_run }}</td></tr>{% endfor %}</table>
{% for n in diag.quality_issues or [] %}<p class="warn">• {{ n }}</p>{% endfor %}
{% for c in diag.source_comparison or [] %}<p>Mənbə müqayisəsi {{ c.symbol }} ↔ {{ c.other }}: {{ c.overlap_days }} ortaq gün, maksimal nisbi fərq {{ pct(c.max_rel_diff) }}, tolerantlıqdan böyük {{ c.days_over_tolerance }} gün.</p>{% endfor %}
{% for n in diag.notes %}<p class="muted">• {{ n }}</p>{% endfor %}
{% for n in diag.warnings %}<p class="warn">• {{ n }}</p>{% endfor %}

<h2>4. Hər alət üzrə model və diaqnostika</h2>
{% for s,a in diag.assets.items() %}
<h3>{{ s }} — {{ a.kind }} / {{ a.dist }}</h3>
<div class="flex"><div style="flex:1;min-width:320px">
<p>BIC {{ fmt(a.bic) }} · AIC {{ fmt(a.aic) }} · davamlılıq {{ fmt(a.persistence) }} · yarımömür {{ fmt(a.half_life_days) }} gün · uzunmüddətli illik vol {{ pct(a.long_run_ann_vol) }} · {{ a.selection or a.fallback_reason or '' }}</p>
{% if a.params %}<table><tr><th>Parametr</th><th>Dəyər</th><th>Robust SE</th></tr>{% for k,v in a.params.items() %}<tr><td>{{ k }}</td><td>{{ fmt(v) }}</td><td>{{ fmt(a.robust_se.get(k)) }}</td></tr>{% endfor %}</table>{% endif %}
{% if a.stability_halves %}<p class="small">Alt dövrlərdə sabitlik: {% for k,v in a.stability_halves.items() %}{{ k }}: {{ fmt(v.first) }} → {{ fmt(v.second) }} (z={{ fmt(v.z) }}, p={{ fmt(v.p) }}); {% endfor %}</p>{% endif %}
</div><div>{{ qq(a.qq) }}</div></div>
<details><summary>Spesifikasiya namizədləri</summary><table><tr><th>Spec</th><th>BIC</th><th>Yığıldı</th><th>Etibarlı</th><th>LB z p</th><th>LB z² p</th></tr>
{% for c in a.candidates %}<tr><td>{{ c.spec }}</td><td>{{ fmt(c.bic) }}</td><td>{{ c.converged }}</td><td>{{ c.valid }}</td><td>{{ fmt(c.lb_z_p) }}</td><td>{{ fmt(c.lb_z2_p) }}</td></tr>{% endfor %}</table></details>
{{ tests_table(a.tests or []) }}
<details><summary>Gəlirlərin diaqnostikası</summary>
<p>{{ diag.returns_diagnostics[s].stationarity_joint }}{% if diag.returns_diagnostics[s].variance_break_date %} · κ2 (xam gəlirlər, yalnız məlumat üçün) qırılma tarixi: {{ diag.returns_diagnostics[s].variance_break_date }}{% endif %}</p>
<code>{{ diag.returns_diagnostics[s].descriptive }}</code>
{{ tests_table(diag.returns_diagnostics[s].tests) }}</details>
{% endfor %}

<h2>5. Çoxölçülü diaqnostika və qiymətləndirmə pəncərəsi</h2>
<p>{{ diag.multivariate.kind }} {% if diag.multivariate.corr_reason %}— {{ diag.multivariate.corr_reason }}{% endif %} · pəncərə {{ diag.multivariate.window_years }} il, ortaq dövr {{ diag.multivariate.common_years }} il</p>
{% if diag.multivariate.breaks %}<p><b>Qırılma testləri (GARCH sup-LR, Holm):</b></p>{{ tests_table(diag.multivariate.breaks) }}
<p class="small muted">Xam gəlirlər üzrə ICSS/κ2 davamlı GARCH-da həddən artıq rədd edir (sintetik ölçü 97% / 58%), ona görə pəncərə qərarı GARCH sup-LR testinə əsaslanır (ölçü ≈4%).
Pəncərəsi qısaldılan alətlər: {{ diag.multivariate.breaks|selectattr('applied')|map(attribute='symbol')|join(', ') or 'yoxdur' }}.</p>{% endif %}
{% if diag.multivariate.kind != 'UNIVARIATE' %}<p>A={{ fmt(diag.multivariate.A) }} B={{ fmt(diag.multivariate.B) }} (SE {{ diag.multivariate.se }}) · Ledoit-Wolf shrinkage {{ fmt(diag.multivariate.shrinkage) }} · u korrelyasiyasının max |off-diag| {{ fmt(diag.multivariate.u_corr_max_abs_offdiag) }} · bütün R müsbət müəyyən: {{ diag.multivariate.all_pd }}</p>
{% if diag.multivariate.engle_sheppard %}{{ tests_table([diag.multivariate.engle_sheppard]) }}{% endif %}
{{ tests_table(diag.multivariate.tests) }}{% endif %}
{% if diag.async_close_check %}<p class="muted">Asinxron bağlanış: günlük orta korrelyasiya {{ fmt(diag.async_close_check.daily_corr_mean) }}, həftəlik {{ fmt(diag.async_close_check.weekly_corr_mean) }}</p>{% endif %}

<h2>6. Backtest nəticələri</h2>
{% if val and val.gates %}<p>Günlük müşahidə: {{ val.n_daily }} · 63 günlük başlanğıclar: {{ val.n_long }}</p>
<h3>VaR</h3>{{ tests_table(val.sections.var_tests) }}
<h3>ES</h3>{{ tests_table(val.sections.es_tests) }}
<h3>Sıxlıq</h3>{{ tests_table(val.sections.density_tests) }}
<div class="flex"><div style="flex:1;min-width:300px"><p><b>Kalibrasiya (günlük PIT)</b></p>{{ curve(val.calibration_curve_daily) }}</div>
<div style="flex:1;min-width:300px"><p><b>Kalibrasiya (63 günlük PIT)</b></p>{{ curve(val.calibration_curve_63d) }}</div></div>
<h3>63 günlük aralıqlar</h3>{{ tests_table(val.sections.interval_tests) }}
{% if val.conformal %}<p>Adaptive conformal (ACI): {% for a in val.conformal %}{{ pct(a.level) }} → əhatə {{ pct(a.coverage_aci) }}, düzəldilmiş səviyyə {{ pct(a.adjusted_level) }}; {% endfor %}</p>{% endif %}
{% if val.scores_63d %}<p>Skorlar (63 gün): CRPS {{ fmt(val.scores_63d.crps_mean) }} · log score {{ fmt(val.scores_63d.logscore_mean) }} · pinball {{ val.scores_63d.pinball_mean }}</p>{% endif %}
{% if val.scores_daily %}<p>Skorlar (günlük): log score {{ fmt(val.scores_daily.logscore_mean) }} · FZ0 orta itki {{ val.scores_daily.fz0_mean }}</p>{% endif %}
<h3>Alətlər üzrə günlük VaR (Kupiec, BH ilə FDR)</h3>{{ tests_table(val.instrument_tests) }}
<h3>Alətlər üzrə 63 günlük əhatə (BH ilə FDR)</h3>{{ tests_table(val.instrument_63d) }}
<p>Volatillik: QLIKE {{ fmt(val.volatility_eval.qlike_mean) }} · MSE {{ fmt(val.volatility_eval.mse) }}</p>{{ tests_table([val.volatility_eval.mincer_zarnowitz]) }}
{% elif val %}<p class="bad">{{ val.error }}</p>{% endif %}

<h2>7. Modellərin müqayisəsi</h2>
{% if val and val.sections %}{{ tests_table(val.sections.model_comparison) }}<p>MCS (90%): daxil: {{ val.mcs.included|join(', ') }}; p-dəyərləri: <code>{{ val.mcs.pvalues }}</code></p>
<p class="small muted">Rəqiblər: tarixi simulyasiya (250 gün), EWMA-normal, GARCH-CCC-normal, HAR-FHS. LightGBM (volatillik) və HMM Mərhələ B-yə aiddir.</p>{% endif %}

<h2>8. MC və parametr xətası</h2>
<p>Ssenari sayı {{ diag.mc.scenarios }}; VaR95 nisbi xəta {{ pct(diag.mc.errors['0.95'].var_rel) }}, CVaR95 {{ pct(diag.mc.errors['0.95'].cvar_rel) }} (hədəf {{ pct(diag.mc.target_rel) }}). Euler cəmi / CVaR95 = {{ fmt(diag.mc.euler_ratio) }} (1 olmalıdır).</p>
<p>Parametr qeyri-müəyyənliyi (parametr qrupları üzrə 5–95%): <code>{{ diag.param_uncertainty }}</code></p>
<p>Drift: rf {{ pct(diag.drift.rf) }}, MRP {{ pct(diag.drift.mrp) }}, indeks {{ diag.drift.index }}; beta: <code>{{ diag.drift.betas }}</code></p>

<h2>9. Məhdudiyyətlər və tövsiyə olunan dəyişikliklər</h2>
<ul>
<li>Backtest sabit (bugünkü) say ilə hipotetik portfel üzərində aparılır.</li>
<li>Backtest-də 63 günlük paylanma modelin sabit ortası ilə simulyasiya olunur (CAPM drifti olmadan).</li>
<li>DCC parametrlərinin qeyri-müəyyənliyi simulyasiyaya daxil edilmir (yalnız GARCH parametrləri).</li>
<li>Conformal düzəliş hesablanır və hesabatda göstərilir; müştəri aralıqlarına avtomatik tətbiq olunmur — interval gate keçmədikdə etibarlılıq aşağı salınır.</li>
<li>Qırılma testinin gücü kiçik dəyişikliklərdə aşağıdır (sintetik: ω×2 → ~17%, ω×4 → ~70%).</li>
{% if val and val.failed_gates %}<li class="bad">Keçməyən gate-lər: {{ val.failed_gates }}. Növbəti addım: rəqib spesifikasiya, daha uzun pəncərə və ya conformal kalibrləmənin tətbiqi.</li>{% endif %}
</ul>
</body></html>"""


def write_report(portfolio_id: int, run_id: int, diag: dict[str, Any], val: dict[str, Any] | None) -> Path:
    alpha = float(get_settings()["validation"]["alpha"])
    env = Environment(autoescape=select_autoescape(["html"]))
    env.globals.update(
        fmt=lambda x: "—" if x is None else (f"{x:.4g}" if isinstance(x, (int, float)) else str(x)),
        pct=lambda x: "—" if x is None else f"{x * 100:.1f}%",
        tests_table=lambda rows: Markup(_tests_table(rows, alpha)),
        qq=lambda pts: Markup(_qq_svg(pts)),
        curve=lambda rows: Markup(_curve_table(rows)),
    )
    folder = get_settings().reports_dir / str(portfolio_id) / str(run_id)
    folder.mkdir(parents=True, exist_ok=True)
    d, v = _clean(diag), _clean(val) if val else None
    (folder / "report.json").write_text(json.dumps({"diagnostics": d, "validation": v}, ensure_ascii=False, indent=1),
                                        encoding="utf-8")
    (folder / "report.html").write_text(env.from_string(TEMPLATE).render(portfolio_id=portfolio_id, run_id=run_id, diag=d, val=v),
                                        encoding="utf-8")
    return folder


def render_html(portfolio_id: int, run_id: int, diag: dict[str, Any], val: dict[str, Any] | None) -> str:
    """The report page from (possibly redacted) stored JSON; the admin API serves this, not the file."""
    alpha = float(get_settings()["validation"]["alpha"])
    env = Environment(autoescape=select_autoescape(["html"]))
    env.globals.update(
        fmt=lambda x: "—" if x is None else (f"{x:.4g}" if isinstance(x, (int, float)) else str(x)),
        pct=lambda x: "—" if x is None else f"{x * 100:.1f}%",
        tests_table=lambda rows: Markup(_tests_table(rows, alpha)),
        qq=lambda pts: Markup(_qq_svg(pts)),
        curve=lambda rows: Markup(_curve_table(rows)),
    )
    return env.from_string(TEMPLATE).render(portfolio_id=portfolio_id, run_id=run_id, diag=diag, val=val)
