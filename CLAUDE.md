# Portfel Analizi Platforması — Claude Code qaydaları

> Əsas spesifikasiya: `PROMPT.md`. Hər mərhələyə başlamazdan əvvəl oradakı müvafiq bölməni yenidən oxu.
> Qəbul edilmiş qərarlar: `docs/decisions.md`. Bu fayl Claude (Cowork) söhbətindən hazırlanıb (oktyabr 2026).

## Layihə

- Sahib və admin: Bahman. Onunla Azərbaycan dilində danış. Kod, kod şərhləri və commit-lər ingilis dilində; müştəri interfeysi Azərbaycan dilində.
- Qovluq: `C:\Users\bahma\OneDrive - ADA University\Desktop\Portfoilo analysis project`. Bütün fayllar burada saxlanılır. Yolda boşluqlar var.
- İstifadə rejimi: hazırda **şəxsi** (`APP_MODE = personal`, lokal). Arxitektura sonradan `commercial` rejiminə keçidə hazır olmalıdır.
- Məhsul: veb tətbiq. Müştərilər bir neçə portfel qurur, səhmləri investing.com simvolu ilə əlavə edir (say məcburi, tarix və qiymət istəyə bağlı), "Generate" basır və bunları alır: 3 aylıq ehtimallı proqnoz, mənfəət/zərər təxmini, risk analizi, tövsiyələr. Statistik validasiyanı yalnız admin görür.

## Dəyişməz qaydalar

1. **investing.com-a proqramla sorğu göndərilmir.** Saytın qaydaları scraping-i və kommersiya istifadəsini qadağan edir, avtomatik sorğulara 403 qaytarır. Bot qorumasını keçməyə çalışma. Məlumat mənbələri: lisenziyalı API (`MarketDataProvider` interfeysi) və investing.com CSV idxalı. CSV idxalı feature flag arxasındadır və kommersiya rejimində müştərilər üçün söndürülüb.
2. **Hər portfel müstəqil təhlil olunur.** Hər run dəyişməz snapshot-dur: tərkib, maya dəyəri, məlumat tarixi, config, seed. Portfel dəyişəndə nəticə "köhnəlib" kimi işarələnir.
3. **Daxiletmə qaydaları** `PROMPT.md` 3.2-dədir. Tarix yoxdursa, bu gün götürülür; qiymət yoxdursa, həmin tarixin bağlanış qiyməti. Heç biri yoxdursa, cari tarix və cari qiymət. Satışlar FIFO ilə hesablanır.
4. **Proqnoz:** 63 ticarət günü. Nöqtə proqnozu yox, paylanma verilir: median, 50%/90% aralıqlar, ehtimallar. Normal paylanma fərz edilmir. Median "proqnoz qiymət" adlanmır.
5. **Model zənciri:**
   - Volatillik: GARCH ailəsi. Default GJR-GARCH(1,1) skewed-t; spesifikasiya BIC və diaqnostika ilə seçilir.
   - Korrelyasiya: DCC(1,1), hədəfi Ledoit-Wolf ilə. Engle-Sheppard testi sabit korrelyasiyanı rədd etmirsə, CCC.
   - Simulyasiya: FHS və parametr qeyri-müəyyənliyi.
   - Drift: CAPM, həssaslıq üçün "gəlir = 0".
6. **Statistik validasiya** (`PROMPT.md` bölmə 6). Gate-lərdən keçməyən model "etibarlı" sayılmır. Dərin statistikaçı kimi davran:
   - modelin fərziyyələrini test et;
   - çoxlu test düzəlişi apar (BH, gate daxilində Holm);
   - testlərin gücünü şərh et;
   - üst-üstə düşən pəncərələr üçün HAC və ya blok bootstrap istifadə et;
   - look-ahead bias-a yol vermə.
7. **Diaqnostika yalnız admin üçündür** və server tərəfində ayrılır. Müştəri API cavablarında test statistikası, p-dəyər və model parametri olmamalıdır.
8. **Tövsiyələr** gələcək risk və gəlirə əsaslanır, maya dəyərinə yox. Hər tövsiyədə "investisiya məsləhəti deyil" xəbərdarlığı olur və tövsiyə audit log-a yazılır.
9. **Siqnal modeli (LightGBM) və RL** yalnız gate-lərdən keçəndə aktivləşir. O vaxta qədər söndürülü qalır.

## Texnologiya

- Backend: Python 3.11+, FastAPI, SQLAlchemy 2 + Alembic, SQLite (inkişaf) / PostgreSQL (istehsal), ayrıca worker prosesi.
- Analitika: numpy, pandas, scipy, statsmodels, arch, scikit-learn, exchange_calendars, numba.
- Frontend: React + TypeScript + Vite + Apache ECharts (M0-da təsdiqləndi, `docs/decisions.md`).
- Konfiqurasiya: `config.yaml` + `.env`. Sirlər git-ə düşmür.

## Kod qaydaları

- Hər modul üçün pytest testləri yaz. Statistik modullar üçün sintetik coverage testləri olsun. Testlərdə canlı API çağırışı olmur.
- Kodda sabit rəqəm yazma: parametrlər config-də olur.
- Windows: yolları dırnaqla və `pathlib` ilə yaz. Skriptlər PowerShell-də, `scripts/` qovluğunda. OneDrive kilidlərinə görə SQLite-a retry əlavə et.
- Tam simulyasiya massivi frontend-ə göndərilmir, yalnız persentillər, ehtimallar və nümunə ssenarilər.

## Dashboard

- Sıra: harada olacağam → ən pis halda nə qədər itirə bilərəm → nə qədər etibarlıdır. Bölmələr: `PROMPT.md` 8.2.
- Rəng funksiyaya görə seçilir; çox səhm üçün çox rəng istifadə olunmur; iki y oxu olan qrafik olmur.
- Hər qrafikin cədvəl görünüşü olur; tünd rejim dəstəklənir.
- Tezlik dili işlədilir ("hər 20 rübdən 1-də"); saxta dəqiqlik olmur.

## Bahman-a hesabat

- Hər mərhələnin sonunda Azərbaycan dilində hesabat ver (`PROMPT.md` bölmə 13): nə quruldu, gate-lər, testlər (H0, statistika, p/q-dəyəri, qərar, şərh), problemlər, növbəti addımlar. Hesabatı `docs/reports/` qovluğunda saxla.
- Qeyri-müəyyənlik olanda soruş, fərziyyə uydurma.
