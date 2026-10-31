# Statistical methodology (implementation notes)

## Generate (fast path)

1. Log returns in the base currency (prices × daily FX), union calendar with forward-filled prices, estimation
   window 5 years (config), proxies (β × index + bootstrapped residuals) for instruments with < 6 months of data.
2. Return diagnostics per instrument: descriptive stats, ADF + KPSS (jointly interpreted), Jarque-Bera,
   Anderson-Darling, Ljung-Box on r and r² (lags 5/10/20), ARCH-LM, Inclán-Tiao and Sansó-Aragó-Carrion κ2
   (informational only: under persistent GARCH without a break they reject ~97% / ~58% at T=1260).
3. Volatility: {GARCH, GJR, EGARCH}(1,1) × {normal, t, skew-t}, robust (Bollerslev-Wooldridge) covariance.
   Selection = minimum BIC among specs that converge, satisfy stationarity/positivity and pass Ljung-Box on z²
   (df-adjusted). EWMA(0.94) if the window is < 2 years or no spec is valid.
   Diagnostics: Ljung-Box z/z², Engle-Ng sign/size bias + joint, PIT goodness of fit (Pearson, KS, AD),
   LR test γ = 0, half-life, sub-period stability.
   Each instrument uses its own window (up to 5 years); correlation uses the common dates.
   Break policy: GARCH sup-LR at the ICSS candidate date, Andrews (1993) null (simulated, cached), Holm across
   instruments; a significant break with ≥ 2 years after it restarts that instrument's window (size ≈ 4%,
   power 17% / 70% / 88% for ω × 2 / 4 / 9). EWMA fallbacks for non-stationary fits are tested with GJR-t.
4. Correlation: Engle-Sheppard test on standardized residuals. Rejects → DCC(1,1) (QML second stage, Ledoit-Wolf
   target); otherwise or < 2 years → CCC with Ledoit-Wolf. Multivariate checks: Hosking portmanteau on u and u²,
   distance of corr(u) from I, positive definiteness of all R_t.
5. Simulation: FHS with whole cross-sections u[τ] (symmetric square roots), DCC recursion and GARCH recursion
   inside each scenario, K = 200 parameter sets from the robust asymptotic normal (invalid draws rejected).
   The shock pool is centred (robust location fits leave non-zero-mean residuals that would add drift).
   Drift: CAPM μ = (rf + β·MRP)/252 − ½σ̄² (σ̄² from the sample for EGARCH / near-integrated fits, Jensen);
   zero-drift sensitivity computed exactly by removing the additive drift.
6. Adaptive S: start 10 000, increase until batch-means relative MC error of VaR95/CVaR95 < 1% (memory-capped).
7. Measures: daily percentiles, checkpoints at month ends, VaR/CVaR 95/99, loss probabilities, P&L vs cost,
   drawdown distribution, touch probabilities, break-even (first passage), Euler CVaR (sums exactly), stress.

## Validation (background)

- Rolling origin at each month end of the last 24 months; models re-selected and re-estimated using data up to
  the origin only (no look-ahead). Daily one-step VaR/ES from FHS with filtered state (data up to t−1).
- Hypothetical constant-quantity portfolio (today's holdings).
- Competitors for the VaR/ES pair: historical simulation (250d), EWMA-normal, GARCH-CCC-normal, HAR-FHS; FZ0 loss,
  Diebold-Mariano (HAC + HLN), Model Confidence Set (90%), Hansen SPA. Log score (KDE) daily and 63-day.
- ES: McNeil-Frey (bootstrap) and Acerbi-Szekely Z2 with the null simulated from each day's predictive sample.
- Per-instrument 63-day coverage and one-step Kupiec, BH across instruments.
- Gate failure: GJR-skewt is tried at α/2 (Bonferroni over two attempts); if better, the run is recomputed with it.
- Validation is cache-only and cut at the run's data date (no newer data, no look-ahead).
- 63-day intervals: coverage with Newey-West (lag in origin units ≈ ⌈63/21⌉) and block bootstrap CIs,
  non-overlapping subsample, with/without parameter uncertainty, CRPS and pinball loss, ACI (Gibbs-Candès).
- Multiple testing: Holm inside each gate (both adjusted and unadjusted shown), BH across instruments.
- Power: simulated power of Kupiec 99% for the actual sample size is reported with gate 1.

## Known limitations (also listed in every admin report)

- DCC parameter uncertainty is not propagated (GARCH parameters only).
- Backtest 63-day simulations use the fitted constant mean, not the CAPM drift.
- Conformal adjustment is computed and reported but not applied to client bands; failing interval gates lower
  the client reliability label instead.
- With 24 monthly origins the 63-day coverage tests have very low power; "not rejected" ≠ "correct".
