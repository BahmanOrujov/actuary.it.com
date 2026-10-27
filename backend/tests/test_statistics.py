"""Risk measures vs analytic answers, Euler property, synthetic method checks (PROMPT.md 6.9, 11)."""
from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as hst
from scipy import stats

from recommend.risk_based import build_recommendations, scenario_cvar
from risk.measures import euler_cvar, mc_standard_error, var_cvar
from validation import stat_tests as st
from validation import synthetic as syn


def test_var_cvar_normal_analytic():
    x = np.random.default_rng(0).standard_normal(400_000)
    v, c = var_cvar(x, 0.95)
    assert v == pytest.approx(stats.norm.ppf(0.95), rel=0.01)
    assert c == pytest.approx(stats.norm.pdf(stats.norm.ppf(0.95)) / 0.05, rel=0.01)


def test_var_cvar_student_t_analytic():
    nu = 5
    x = stats.t.rvs(nu, size=400_000, random_state=1)
    v, c = var_cvar(x, 0.99)
    q = stats.t.ppf(0.99, nu)
    es = stats.t.pdf(q, nu) / 0.01 * (nu + q ** 2) / (nu - 1)
    assert v == pytest.approx(q, rel=0.02)
    assert c == pytest.approx(es, rel=0.03)


def test_mc_error_shrinks():
    rng = np.random.default_rng(2)
    small = mc_standard_error(rng.standard_normal(5_000), 0.95)["var_rel"]
    big = mc_standard_error(rng.standard_normal(80_000), 0.95)["var_rel"]
    assert big < small / 2


@settings(max_examples=50, deadline=None)
@given(hst.integers(2, 6), hst.integers(0, 10_000))
def test_euler_components_sum_to_cvar(n, seed):
    rng = np.random.default_rng(seed)
    P = rng.standard_t(4, size=(4000, n)) * rng.uniform(0.5, 3, n)
    comp = euler_cvar(P, P.sum(axis=1), 0.95)
    port = P.sum(axis=1)
    q = np.quantile(port, 0.05)
    assert comp.sum() == pytest.approx(-port[port <= q].mean(), rel=1e-9)


def test_recommendations_not_based_on_cost_and_reduce_risk():
    rng = np.random.default_rng(5)
    S = 5000
    pnl = np.column_stack([rng.normal(0, 1, S) * 1, rng.normal(0, 1, S) * 10, rng.normal(0, 1, S) * 1])
    ctx = {"symbols": ["A", "B", "C"], "names": ["A", "B", "C"], "qty": [10, 10, 10], "mv": [100, 100, 100],
           "price": [10, 10, 10], "pnl_assets": pnl, "V": 300, "limit": 0.03, "clusters": [1, 2, 3],
           "stress": [], "targets": [], "asset_end": [{}, {}, {}]}
    recs = build_recommendations(ctx, {"recommend": {"risk_share_ratio": 1.5, "max_position_weight": 0.5,
                                                     "max_cluster_weight": 0.9, "disclaimer": "d"}}, "medium")
    b = [r for r in recs if r["symbol"] == "B" and r["action"] == "reduce"]
    assert b and b[0]["cvar_after"] < b[0]["cvar_before"]
    assert all("cost" not in r["reason"].lower() for r in recs)
    assert scenario_cvar(pnl, np.ones(3)) == pytest.approx(recs[0]["cvar_before"])


def test_fhs_drift_controlled_by_mu_only():
    """Residuals with a non-zero mean (robust location fit) must not leak an extra drift into FHS paths."""
    import pandas as pd

    from risk.dcc import CorrModel
    from risk.garch import AssetModel
    from risk.simulate import build_pool, simulate_paths

    rng = np.random.default_rng(11)
    T = 1500
    z = rng.standard_normal(T) + 0.3
    p = {"omega": 0.05, "alpha": 0.05, "gamma": 0.0, "beta": 0.9}
    m = AssetModel("X", "GARCH", "t", 100.0, 0.0, p, None, np.ones(T), z, z.copy(),
                   pd.bdate_range("2020-01-01", periods=T), 1.0, 1.0)
    corr = CorrModel("UNIVARIATE", np.eye(1))
    pool = build_pool([m], corr)
    assert abs(pool.mean()) < 1e-12
    sim = simulate_paths([m], corr, pool, np.array([0.0]), 63, 4000, 1, rng, param_uncertainty=False)
    total = sim.log_returns[:, :, 0].sum(axis=1)
    assert abs(total.mean()) < 0.01  # an uncentred pool would give ~ 63 * 0.01 * 0.3 = 0.19


def test_egarch_long_run_variance_uses_sample():
    from risk.garch import long_run_variance

    p = {"omega": 0.002, "alpha": 0.01, "gamma": -0.05, "beta": 0.998}
    assert long_run_variance("EGARCH", p, 3.0) == 3.0
    assert long_run_variance("GJR", {"omega": 0.02, "alpha": 0.04, "gamma": 0.1, "beta": 0.88}, 9.0) == pytest.approx(0.02 / 0.03)
    assert long_run_variance("GARCH", {"omega": 0.001, "alpha": 0.05, "gamma": 0.0, "beta": 0.948}, 2.5) == 2.5


def test_kupiec_known_values():
    h = np.zeros(250, int)
    h[:10] = 1
    r = st.kupiec_pof(h, 0.01)
    assert r.p_value < 0.01
    assert st.basel_traffic_light(h)["zone"] == "red"


def test_holm_and_bh():
    p = [0.01, 0.04, 0.03, 0.5]
    assert st.holm(p) == pytest.approx([0.04, 0.09, 0.09, 0.5])
    assert st.benjamini_hochberg(p) == pytest.approx([0.04, 0.04 * 4 / 3, 0.04 * 4 / 3, 0.5])


def test_crps_matches_normal_closed_form():
    x = np.random.default_rng(3).standard_normal(20000)
    y = 0.3
    exact = y * (2 * stats.norm.cdf(y) - 1) + 2 * stats.norm.pdf(y) - 1 / np.sqrt(np.pi)
    assert st.crps_ensemble(x, y) == pytest.approx(exact, abs=0.01)


def test_size_and_power_of_var_tests():
    r = syn.size_and_power(n=500, reps=600)
    assert 0.01 <= r["size_95"]["kupiec"] <= 0.09
    assert r["power_95_vs_8pct"]["kupiec"] > 0.5
    assert r["power_99_vs_2pct"]["kupiec"] > r["size_99"]["kupiec"]
    assert r["size_berkowitz"] < 0.1


def test_gjr_parameter_recovery():
    r = syn.parameter_recovery(reps=6, T=2500)
    assert abs(r["beta"]["bias"]) < 0.05
    assert abs(r["gamma"]["bias"]) < 0.06
    assert r["alpha"]["rmse"] < 0.05


def test_dcc_recovery_and_engle_sheppard():
    r = syn.dcc_recovery()
    assert abs(r["A_hat"] - 0.05) < 0.03 and abs(r["B_hat"] - 0.90) < 0.06
    assert r["es_p"] < 0.05  # dynamic correlation detected


def test_coverage_study():
    """PROMPT.md 6.9: hundreds of synthetic replications; nominal level inside the binomial 95% CI."""
    r = syn.coverage_study(reps=300)
    assert r["0.9"]["nominal_in_ci"], r
    assert r["0.5"]["nominal_in_ci"], r


def test_return_based_break_tests_oversize_under_garch():
    """Documents why ICSS / kappa-2 on raw returns are not used for decisions: with persistent GARCH and no
    break they reject far above 5% (measured ~97% and ~58% at T=1260)."""
    from risk.diagnostics import inclan_tiao, kappa2

    rng = np.random.default_rng(8)
    reps = 100
    it_rej = k2_rej = 0
    for _ in range(reps):
        r = syn.simulate_gjr(1260, rng)
        it_rej += inclan_tiao(r)[0].p_value < 0.05
        k2_rej += kappa2(r)[0].p_value < 0.05
    assert it_rej / reps > 0.5 and k2_rej / reps > 0.2


def test_sup_lr_null_matches_andrews_table():
    """Andrews (1993) Table 1, pi0 = 0.15, 5%: p=1 -> 8.85, p=6 -> about 20."""
    from risk.garch import _sup_lr_null

    assert np.quantile(_sup_lr_null(1, 0.15), 0.95) == pytest.approx(8.85, abs=0.5)
    assert 18.5 < np.quantile(_sup_lr_null(6, 0.15), 0.95) < 21.5


def test_garch_break_test_size_and_power():
    """The decision test (GARCH sup-LR at the ICSS candidate) keeps its size under GARCH and detects a
    variance-level shift (omega x 9) with high power, locating the break date."""
    import pandas as pd

    from risk.garch import garch_break_test, select_garch

    cfg = syn._cfg()
    rng = np.random.default_rng(12)
    idx = pd.bdate_range("2000-01-03", periods=1260)
    null_p = []
    for _ in range(30):
        m = select_garch("S", pd.Series(syn.simulate_gjr(1260, rng), index=idx), cfg, False)
        p = garch_break_test(m, 0.15)[0].p_value
        if p is not None:  # None only when no GARCH spec converged (EWMA fallback)
            null_p.append(p)
    alt = []
    for _ in range(20):
        p2 = dict(syn.TRUE_GJR)
        p2["omega"] *= 9
        r = np.concatenate([syn.simulate_gjr(700, rng), syn.simulate_gjr(560, rng, p=p2)])
        m = select_garch("S", pd.Series(r, index=idx), cfg, False)
        t, k = garch_break_test(m, 0.15)
        if t.p_value is not None:
            alt.append((t.p_value < 0.05, k is not None and abs(k - 700) < 60))
    assert len(null_p) >= 25 and len(alt) >= 15
    assert np.mean(np.array(null_p) < 0.05) <= 0.15
    assert np.mean([a for a, _ in alt]) >= 0.6 and np.mean([b for _, b in alt]) >= 0.6


def test_kappa2_detects_real_break():
    from risk.diagnostics import kappa2

    rng = np.random.default_rng(9)
    r = np.concatenate([rng.standard_normal(700) * 0.01, rng.standard_normal(560) * 0.025])
    t, k = kappa2(r)
    assert t.p_value < 0.01 and abs(k - 700) < 60


def test_backtest_drift_is_production_capm_and_point_in_time():
    """The backtest must validate the drift clients see (CAPM), not the window's sample mean, and must not
    read the risk-free rate or index returns after the origin."""
    import pandas as pd

    from app.config import get_settings
    from risk.engine import capm_drift, fit_system
    from validation.backtest import DriftInputs, _origin_drift

    cfg = get_settings().raw
    rng = np.random.default_rng(7)
    idx = pd.bdate_range("2019-01-01", periods=1400)
    mkt = pd.Series(rng.standard_normal(len(idx)) * 0.01, index=idx)
    # a strong trend: the sample mean (>20%/yr) is far above the CAPM drift
    a = 0.002 + 1.2 * mkt + rng.standard_normal(len(idx)) * 0.01
    b = 0.0015 + 0.8 * mkt + rng.standard_normal(len(idx)) * 0.012
    R = pd.DataFrame({"AAA": a, "BBB": b}, index=idx)
    origin = idx[1200]
    win = R.loc[:origin]
    fs = fit_system(win, cfg, full=False, parallel=False)
    rf = pd.Series(0.03, index=idx)
    rf.loc[idx[1201]:] = 0.20  # a future jump the backtest must not see
    mu = _origin_drift(win, fs.models, DriftInputs(market=mkt, rf=rf, mrp=0.05), origin)
    expected, betas = capm_drift(win, mkt.loc[:origin], 0.03, 0.05, fs.models)
    np.testing.assert_allclose(mu, expected)
    assert betas[0] == pytest.approx(1.2, abs=0.1) and betas[1] == pytest.approx(0.8, abs=0.1)
    sample_mean = win.mean().to_numpy()
    assert np.all(mu * 252 < 0.1) and np.all(sample_mean * 252 > 0.2)
    # without drift inputs the forecasts assume zero expected (simple) return
    mu0 = _origin_drift(win, fs.models, DriftInputs(), origin)
    s2bar = np.array([m.long_run_var / m.scale ** 2 for m in fs.models])
    np.testing.assert_allclose(mu0, -0.5 * s2bar)
