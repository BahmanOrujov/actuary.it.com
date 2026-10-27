# Claude Code üçün tapşırıq: Portfel Analizi Platforması

> Hazırlayan: Bahman (Claude Cowork söhbəti əsasında, oktyabr 2026).
> Bu sənəd layihənin **əsas spesifikasiyasıdır**. `CLAUDE.md` qısa daimi qaydaları saxlayır. Ziddiyyət olarsa, bu sənəd üstündür; şübhə olanda Bahman-dan soruş.

---

## 0. Rolun və iş qaydası

Bu layihədə üç rolu birlikdə oynayırsan:

1. **Senior full-stack mühəndis:** təhlükəsiz, test olunmuş, asan saxlanılan kod yazırsan.
2. **Kəmiyyət risk modelləşdiricisi:** GARCH, DCC, Filtered Historical Simulation, risk ölçüləri və stress testləri qurursan.
3. **Dərin statistikaçı (ekonometrika və proqnoz qiymətləndirməsi):** hər modelin fərziyyələrini test edirsən, nəticələri ciddi statistik meyarlarla qəbul və ya rədd edirsən, p-dəyərlərlə yanaşı effekt ölçülərini və testlərin gücünü şərh edirsən.

**Dil:**

- Bahman ilə Azərbaycan dilində danış.
- Kod, dəyişən adları, kod şərhləri və commit mesajları ingilis dilində olsun.
- Müştəri interfeysi Azərbaycan dilində olsun (i18n strukturu ilə, sonradan başqa dil əlavə etmək mümkün olsun).

**Qovluq:** bütün layihə fayllarını bu qovluqda yarat və saxla:

`C:\Users\bahma\OneDrive - ADA University\Desktop\Portfoilo analysis project`

Qovluğun adı "Portfoilo" yazılışı ilə mövcuddur, adını dəyişmə. Yolda boşluqlar var, ona görə bütün komandalarda yolu dırnaq içində yaz.

**İş qaydası:**

1. Bu sənədi tam oxu.
2. Kod yazmazdan əvvəl bölmə 15-dəki açıq sualları Bahman-a ver. Cavabları `docs/decisions.md` faylına yaz.
3. Bölmə 14-dəki mərhələlər əsasında icra planı hazırla və Bahman-ın təsdiqini al. Bu mərhələdə kod yazma.
4. Hər mərhələnin sonunda testləri işə sal və Azərbaycan dilində qısa hesabat ver (bölmə 13). Yalnız bundan sonra növbəti mərhələyə keç.
5. Qeyri-müəyyənlik olanda fərziyyə uydurma: ya soruş, ya da fərziyyəni açıq yaz.
6. Qəbul edilən yeni qərarları `docs/decisions.md` faylında, lazım olsa `CLAUDE.md` faylında yenilə.

---

## 1. Məhsulun təsviri

İstifadəçilərin öz səhm portfellərini qurub təhlil etdiyi **veb tətbiq**.

**İstifadə rejimi:** hazırda **şəxsi istifadə** (Bahman-ın öz kompüterində, lokal). Əsas məlumat mənbəyi Yahoo Finance-dir (`yfinance`), onun şərtləri isə yalnız şəxsi istifadəyə icazə verir (bölmə 2). Arxitektura gələcəkdə kommersiya rejiminə keçidə hazır olmalıdır: `APP_MODE = personal | commercial` (config). Kommersiya rejimində Yahoo və investing.com mənbələri avtomatik söndürülür və lisenziyalı provayder tələb olunur.

**İki rol var:**

- **Müştəri (client):** qeydiyyatdan keçir, bir və ya bir neçə portfel yaradır, səhmləri əlavə edir və "Generate" düyməsini basır. Nəticədə proqnozları, mənfəət/zərər təxminlərini, riski və tövsiyələri görür. Yalnız öz portfellərini görür.
- **Admin (Bahman):** bütün statistik testləri, model diaqnostikasını, backtest nəticələrini, xəbərdarlıqları və sistemin vəziyyətini görür. **Müştəri bu məlumatların heç birini görməməlidir** (bölmə 6.10).

**Müştərinin əsas axını:**

1. Portfel yaradır: ad, əsas valyuta, risk profili.
2. Səhm əlavə edir: simvolu investing.com-da göründüyü kimi yazır (məsələn `AAPL`, `THYAO`). Sistem uyğun alətləri tapır (ad, birja, ölkə, valyuta). Tək namizəd varsa, səhm dərhal əlavə olunur; bir neçə namizəd varsa, müştəri düzgününü seçir.
3. Hər alış üçün daxil edir: **say (məcburi)**, **alış tarixi (istəyə bağlı)**, **alış qiyməti (istəyə bağlı)**. Satış əməliyyatı da daxil etmək olar: say, tarix, qiymət.
4. Səhmləri daxil etdikdən sonra **"Generate"** düyməsini basır.
5. Analiz arxa planda işləyir və proqress göstəricisi görünür. Bitəndə nəticə dashboard-u açılır.
6. Portfeli dəyişəndə (səhm əlavə edir, silir, say, tarix və ya qiyməti dəyişir) köhnə nəticələr "köhnəlib" kimi işarələnir. Müştəri yenidən "Generate" basır. Göstərilən nəticələr həmişə portfelin cari tərkibinə uyğun olmalıdır.

**Portfellərin müstəqilliyi:** hər portfel tam müstəqil təhlil olunur. Bir portfelin modeli, parametrləri, simulyasiyası və nəticələri digərinə təsir etmir. Portfellər arasında paylaşılan yeganə şey xam bazar məlumatı keşidir (eyni simvolun qiymət tarixçəsi).

**Alış və satış qiymətlərinin məqsədi:** mövqelərin və bütün portfelin **mənfəət və ya zərərini** hesablamaq və 3 ay sonrakı mənfəət/zərəri ehtimal paylanması şəklində təxmin etmək (bölmə 3.4).

---

## 2. Məlumat qatı

### 2.1 Hüquqi məhdudiyyət (mütləq)

- investing.com-un Terms and Conditions sənədi (Last Modified: August 2026) avtomatik sistemlə məlumat çıxarmağı ("scraping, data mining, robot or spider programs") açıq şəkildə qadağan edir. Saytdan istifadəni şəxsi və qeyri-kommersiya məqsədi ilə məhdudlaşdırır, bazar məlumatının yenidən paylanmasını da qadağan edir. Bundan əlavə, 2026-cı ilin iyulundan sayt avtomatik sorğulara HTTP 403 qaytarır.
- Ona görə **investing.com-a proqramla sorğu göndərmə, onu scrape etmə, Cloudflare və ya başqa bot qorumasını keçməyə çalışma.** Headless browser, `curl_cffi`, IP rotasiyası və oxşar üsullar qadağandır.
- investing.com simvolları yalnız istifadəçinin tanıdığı **identifikator** kimi istifadə olunur.
- **Yahoo Finance:** rəsmi API yoxdur. `yfinance` Yahoo ilə əlaqəsi olmayan, qeyri-rəsmi kitabxanadır. Onun öz xəbərdarlığına görə "intended for research and educational purposes" və "the Yahoo! finance API is intended for personal use only". Ona görə Yahoo mənbəyi yalnız `APP_MODE = personal` rejimində işləyir. Yahoo-ya aqressiv sorğu göndərmə (bölmə 2.4-dəki limitlər).

### 2.2 Mənbələr

Bütün mənbələr ümumi `MarketDataProvider` interfeysi arxasında olmalıdır:

```python
class MarketDataProvider(Protocol):
    def search_symbols(self, query: str) -> list[InstrumentCandidate]: ...
    def get_instrument(self, provider_symbol: str) -> InstrumentMeta: ...
    def get_daily_bars(self, provider_symbol: str, start: date, end: date) -> pd.DataFrame: ...  # split/dividend-adjusted
    def get_latest_price(self, provider_symbol: str) -> PriceQuote: ...
    def get_fx_daily(self, base: str, quote: str, start: date, end: date) -> pd.DataFrame: ...
    def get_corporate_actions(self, provider_symbol: str) -> CorporateActions: ...  # splits, dividends (if available)
```

1. **Əsas mənbə: Yahoo Finance (`yfinance`), avtomatik.** `YahooProvider` adapteri `MarketDataProvider` interfeysini həyata keçirir:
   - **Simvol axtarışı:** `yf.Search(query).quotes`. Namizədlər: ad, birja, valyuta, alət növü. Nəticəni `yf.Ticker(symbol).info`-dan (və ya `fast_info`) valyuta və birja ilə təsdiqlə.
   - **investing.com simvolu → Yahoo simvolu xəritəsi:** ABŞ səhmləri şəkilçisiz (`AAPL`); digər birjalarda şəkilçi lazımdır, məsələn Borsa İstanbul `THYAO.IS`, London `.L`, Xetra `.DE`, Paris `.PA`, Tokio `.T`, Honq Konq `.HK`. Birja → şəkilçi cədvəlini config-də saxla. Uyğunluq tapılmasa, istifadəçiyə namizədləri göstər.
   - **Tarixçə:** `yf.Ticker(t).history(period="max", auto_adjust=False, actions=True)`. Bir neçə simvol üçün `yf.download(..., group_by="ticker", threads=False)`.
   - **Hansı qiymət nə üçün:**
     - Gəlirlər və model üçün `Adj Close` (split və dividendə görə düzəldilmiş, ümumi gəlir).
     - Maya dəyəri, "yalnız tarix" daxil ediləndə alış qiyməti və mənfəət/zərər üçün `Close` (split-ə görə düzəldilmiş, dividendə görə yox). Split olubsa, köhnə alışların sayı və qiyməti split əmsalı ilə düzəldilir (bölmə 3.2).
     - Split və dividendlər `actions` sütunlarından götürülür.
   - **Son qiymət:** `fast_info["last_price"]` və ya son günlük bar. Hansı mənbədən və hansı vaxta aid olduğunu saxla (Yahoo qiymətləri gecikmiş ola bilər).
   - **Valyuta:** FX tikerləri, məsələn `EURUSD=X`, `USDTRY=X`. AZN üçün `USDAZN=X` mövcud deyilsə, config-dəki sabit məzənnədən (1.70) istifadə et və bunu admin hesabatında qeyd et.
   - **Bazar indeksləri** (CAPM və stress testləri üçün): məsələn `^GSPC`, `XU100.IS`. Portfelin birjasına görə config-dən seçilir. Faiz faktoru üçün `^TNX`, neft üçün `BZ=F`.
   - **Etibarlılıq:** `yfinance` versiyasını sabitlə (`requirements`-də dəqiq versiya). Yahoo strukturu dəyişəndə kitabxana sına bilər: xətaları tut, istifadəçiyə aydın mesaj ver və keşdəki məlumatla işləməyə davam et. Yahoo məlumatında səhvlər ola bilər (boş günlər, sıfır həcm, səhv sıçrayışlar): bölmə 2.4-dəki keyfiyyət yoxlamaları burada xüsusilə vacibdir.
2. **Gələcək mənbə: lisenziyalı API** (kommersiya rejimi üçün). İndi qurulmur, amma interfeys ona hazır olmalıdır. Namizədlər: EODHD (şəxsi plan $19.99/ay, 30+ il tarixçə; kommersiya üçün B2B planı), Twelve Data (Business planları). API açarı yalnız `.env` faylında saxlanılır.
3. **investing.com CSV idxalı (əl ilə, ehtiyat mənbə).** Yahoo-da olmayan və ya Yahoo sınanda istifadə olunur. İstifadəçi investing.com-un "Historical Data" səhifəsindən CSV faylını özü endirir və proqrama yükləyir.
   - Parser bu formatı tanımalıdır: `Date, Price, Open, High, Low, Vol., Change %`. O cümlədən:
     - müxtəlif tarix formatları (`MM/DD/YYYY`, `DD.MM.YYYY` və s.);
     - min ayırıcıları;
     - `K/M/B` həcm şəkilçiləri və `%` işarəsi;
     - tərs xronoloji sıra.
   - investing.com qaydaları məlumatdan yalnız şəxsi və qeyri-kommersiya məqsədilə istifadəyə icazə verir. Ona görə bu funksiya **feature flag** arxasında olmalıdır:
     - `personal` rejimində **aktivdir**;
     - `commercial` rejimində avtomatik **söndürülür**;
     - parametrlər səhifəsində bu barədə xəbərdarlıq mətni göstərilir.
   - CSV qiymətlərinin dividendə görə düzəldilib-düzəldilmədiyi bəlli deyil. Split sıçrayışlarını yoxla, dividend düzəlişinin olmadığını isə admin hesabatında qeyd et.
   - Hər qiymət sırasında mənbə saxlanılır: `source = yahoo | api:<provider> | csv:investing | csv:user`.
   - Eyni simvol üçün həm Yahoo, həm CSV məlumatı varsa, üst-üstə düşən günlərdə fərqləri yoxla və admin hesabatında göstər.
4. **Ümumi CSV idxalı:** istifadəçinin istifadə hüququ olan istənilən mənbədən. Formatlaşdırma qaydaları eynidir.

### 2.3 Simvolun tapılması

- İstifadəçi simvolu yazır, sistem provayderdə axtarır və namizədləri göstərir: ad, birja, ölkə, valyuta, alət növü, mümkünsə ISIN.
- Eyni simvol bir neçə birjada ola bilər (məsələn, `AAPL` NASDAQ-da və Frankfurtda). Belə halda avtomatik seçmə, istifadəçiyə təsdiq etdir.
- `instruments` cədvəlində saxla: `investing_symbol`, `provider_symbol`, `exchange_mic`, `currency`, `isin`, `name`, `type`.
- Simvol tapılmasa, aydın mesaj göstər. CSV idxalı aktivdirsə, onu təklif et.

### 2.4 Keş, yeniləmə və keyfiyyət

- Günlük qiymətlər lokal keşdə (SQLite və ya Parquet) saxlanılır və yalnız çatışmayan günlər yüklənir. Eyni simvol gündə bir dəfədən çox yenilənmir (bazar bağlandıqdan sonra).
- Yahoo üçün sorğu qaydaları (config-də):
  - sorğular arasında fasilə (məsələn 1–2 saniyə), paralel sorğu yoxdur;
  - `YFRateLimitError` və şəbəkə xətalarında exponential backoff ilə retry (məsələn 3 cəhd);
  - ilk yükləmədə tarixçə tam (`period="max"`), sonra yalnız yeni günlər.
- Tarixçə: mümkün olan maksimum (stress testləri üçün ən azı 15 il). Model qiymətləndirmə pəncərəsi config-də olur: default 5 il, minimum 2 il.
- Ticarət təqvimləri üçün `exchange_calendars` (və ya `pandas_market_calendars`) istifadə et.
- Keyfiyyət yoxlamaları:
  - boş günlər və dublikat tarixlər;
  - mənfi və ya sıfır qiymətlər;
  - səhv sıçrayışlar (robust z-score, MAD əsaslı);
  - düzəldilməmiş split-lər;
  - uzun müddət dəyişməyən qiymətlər (likvidsizlik);
  - fərqli birja təqvimləri.
- Yoxlamaların nəticələri admin hesabatına düşür. Müştəri yalnız sadə xəbərdarlıq görür, məsələn: "Bu səhmin tarixçəsi qısadır, nəticələr daha az etibarlıdır."
- Valyuta: portfelin əsas valyutası seçilir. Hər alətin qiyməti gündəlik FX məzənnəsi ilə əsas valyutaya çevrilir və model **əsas valyutadakı gəlirlər** üzərində qurulur. Beləcə valyuta riski modelə avtomatik daxil olur.

---

## 3. Portfel, əməliyyatlar və mənfəət/zərər

### 3.1 Verilənlər modeli (minimum)

`users`, `portfolios` (ad, əsas valyuta, risk profili, risk limiti), `instruments`, `transactions` (portfolio_id, instrument_id, side BUY/SELL, quantity, trade_date, price, fees, currency, input_flags), `analysis_runs`, `run_results` (müştəri üçün), `run_diagnostics` (yalnız admin), `recommendations`, `audit_log`, `jobs`.

### 3.2 Alış üçün daxiletmə qaydaları

| Nə daxil edilib | Sistem nə edir |
|---|---|
| Say + tarix + qiymət | Hər ikisi istifadə olunur. Qiymət həmin günün [Low, High] aralığından kənardırsa (tolerans config-də), xəbərdarlıq verilir, amma bloklanmır |
| Say + tarix | Qiymət = həmin günün bağlanış qiyməti. Ticarət günü deyilsə, əvvəlki ticarət gününün bağlanışı götürülür. İstifadə olunan qiymət istifadəçiyə göstərilir |
| Say + qiymət | Tarix = bu gün. "Tarix daxil edilməyib" kimi işarələnir |
| Yalnız say | Tarix = bu gün, qiymət = ən son bağlanış qiyməti. "Cari tarix və qiymət istifadə olundu" kimi işarələnir |

- Gələcək tarix qəbul edilmir. Tarix alətin tarixçəsindən əvvəldirsə, xəbərdarlıq verilir.
- Say müsbət olmalıdır. Fraksiyalı səhmlərə icazə config ilə idarə olunur (default: 4 onluq rəqəmə qədər).
- Eyni səhm bir neçə dəfə alına bilər; hər alış ayrıca lot kimi saxlanılır.
- Split olubsa, köhnə tarixli alışın sayı və qiyməti split əmsalı ilə düzəldilir ki, düzəldilmiş qiymət tarixçəsinə uyğun gəlsin.

### 3.3 Satış

- Satılan say həmin tarixdə mövcud olan saydan çox ola bilməz.
- Reallaşmış mənfəət/zərər **FIFO** üsulu ilə hesablanır (default). Orta qiymət üsulu config ilə seçilə bilər. Komissiyalar çıxılır.
- Provayder dividend məlumatı verirsə, dividendlər ümumi gəlirə əlavə olunur və ayrıca göstərilir.

### 3.4 Mənfəət/zərər göstəriciləri

**Cari vəziyyət** (hər mövqe və bütün portfel üçün):

- say, orta və ya FIFO maya dəyəri, bazar dəyəri;
- reallaşmamış mənfəət/zərər (məbləğ və %);
- reallaşmış mənfəət/zərər;
- ümumi gəlir, saxlama müddəti, portfeldəki çəki.

**3 aylıq təxmin (əsas məqsəd).** Simulyasiyadan, maya dəyərinə nisbətən hesablanır:

- aralıq tarixlərdə və dövrün sonunda mənfəət/zərərin medianı, 50% və 90% aralıqları (pulla və faizlə);
- mənfəətdə olma ehtimalı: P(dəyər > maya dəyəri);
- X%-dən çox zərər ehtimalı və zərərin CVaR-ı;
- hazırda zərərdə olan mövqe üçün: dövr ərzində maya dəyərinə qayıtma (break-even) ehtimalı, yəni ilk keçid ehtimalı.

**Vacib prinsip:** maya dəyəri keçmişdə ödənilmiş məbləğdir və gələcək qərarlar üçün əsas deyil. Tövsiyələr mövqenin zərərdə və ya mənfəətdə olmasına görə yox, gələcək risk və gəlirə görə verilir. "Zərərdədir — sat" və ya "mənfəətdədir — mənfəəti götür" kimi qaydalar qadağandır. Vergi və komissiya bunun istisnası ola bilər (config).

---

## 4. Analiz axını ("Generate")

1. Müştəri "Generate" basır. `analysis_run` yaradılır və iş növbəyə düşür. UI addımları göstərir: məlumat yenilənir → yoxlanılır → modellər qurulur → simulyasiya → tövsiyələr.
2. **Snapshot:** run həmin anki vəziyyəti dondurur: portfelin tərkibi, maya dəyərləri, məlumatın son tarixi, config, model versiyası və random seed. Nəticələr dəyişməzdir və təkrar alına bilər: eyni snapshot həmişə eyni nəticəni verir.
3. Portfel dəyişəndə son run "köhnəlib" kimi işarələnir və banner görünür: "Portfel dəyişib. Nəticələri yeniləmək üçün Generate düyməsini basın."
4. **Sürətli yol və tam validasiya:**
   - Generate sürətli yoldur: məlumat, diaqnostika, model seçimi və qiymətləndirmə, simulyasiya, risk ölçüləri, tövsiyələr. Hədəf: 30 səhmə qədər portfel üçün adi noutbukda təxminən 2–3 dəqiqə. Spesifikasiya seçimini paralel apar.
   - Tam backtest və statistik validasiya (bölmə 6) ayrıca fon işi kimi işləyir: Generate-dən sonra avtomatik başlayır və ya gecə cədvəli ilə işləyir. Eyni alət dəsti və eyni məlumat tarixi üçün nəticə keşlənir.
   - Validasiya bitənə qədər müştəri etibarlılıq etiketini "yoxlanılır" kimi görür. Validasiya bitəndə etiket yenilənir.
5. **Kənar hallar:**
   - Portfeldə 1 səhm varsa: univariate model istifadə olunur; DCC, klaster və korrelyasiya bölmələri göstərilmir.
   - Tarixçə 2 ildən qısadırsa: EWMA və ya sadələşdirilmiş model, etibarlılıq "aşağı".
   - Tarixçə 6 aydan qısadırsa: həmin səhm üçün bazar indeksinə əsaslanan proksi (beta × indeks + idiosinkratik qalıq), adminə xəbərdarlıq.
   - Səhmlər fərqli birjalardadırsa: təqvimlər birləşdirilir, ticarət olmayan günlərdə qiymət dəyişmir. Asinxron bağlanış saatları korrelyasiyanı azaldır. Bunu admin hesabatında qeyd et; lazım olsa korrelyasiyanı 2 günlük və ya həftəlik gəlirlərlə də qiymətləndirib müqayisə et.
   - Portfeldə yalnız nağd pul varsa: analiz aparılmır, aydın mesaj göstərilir.

---

## 5. Modellər

### 5.1 Proqnoz dövrü və çıxışlar

- Dövr: son məlumat günündən **63 ticarət günü** (~3 ay). Təqvim portfelin əsas birjasına görə götürülür (portfeldə ən böyük çəkisi olan birja).
- Aralıq nöqtələr: dövrə düşən hər ayın son ticarət günü və dövrün sonu.
- Nöqtə proqnozu verilmir, **paylanma** verilir: median + 50% və 90% aralıqlar + ehtimallar. Median heç vaxt "proqnoz qiymət" adlanmır.
- Normal paylanma fərz edilmir.

### 5.2 Model siyahısı

| Qrup | Model / metod | Status |
|---|---|---|
| Hazırlıq | Log-gəlirlər (əsas valyutada), robust z-score (MAD) | Əsas |
| Diaqnostika | ADF + KPSS, Jarque-Bera, Ljung-Box, ARCH-LM | Əsas |
| Volatillik | GJR-GARCH(1,1), skewed Student-t (default) | Əsas |
| Volatillik | Spesifikasiya seçimi: {GARCH, GJR-GARCH, EGARCH}(1,1) × {normal, Student-t, skewed-t}, BIC və diaqnostika ilə | Əsas |
| Volatillik | EWMA (λ = 0.94) | Ehtiyat |
| Korrelyasiya | DCC(1,1), hədəf matrisi Ledoit-Wolf ilə | Əsas |
| Korrelyasiya | CCC + Ledoit-Wolf (Engle-Sheppard testi sabit korrelyasiyanı rədd etmirsə və ya məlumat 2 ildən azdırsa) | Ehtiyat |
| Simulyasiya | FHS + DCC + parametr qeyri-müəyyənliyi | Əsas |
| Gəlir | CAPM (beta OLS ilə) və "gəlir = 0" həssaslıq variantı | Əsas |
| Gəlir | Black-Litterman | Şərti (fikirlər olsa) |
| Risk | Persentillər, VaR, CVaR, max drawdown, ilk keçid ehtimalı, Euler bölgüsü | Əsas |
| Struktur | İerarxik klasterləşmə (korrelyasiya məsafəsi), HHI | Əsas |
| Stress | Tarixi ssenarilər, çoxfaktorlu OLS (bazar, faiz, neft) | Əsas |
| Rəqib | Tarixi simulyasiya, EWMA-normal, GARCH-CCC, HAR, LightGBM (volatillik), HMM (rejim) | Rəqib |
| Kalibrləmə | Adaptive conformal inference | Şərti |
| Əlavə | Implied volatility düzəlişi | Şərti (opsion məlumatı olsa) |

Rəqib modellər yalnız backtest-də əsas modeldən statistik olaraq yaxşı nəticə versələr istifadə olunur (bölmə 6.5).

### 5.3 Simulyasiya alqoritmi (FHS + DCC)

```text
N = alət sayı, H = 63, S = ssenari sayı (default 10 000; bölmə 6.7-yə görə adaptiv)

1. r[i,t] = ln(P[i,t] / P[i,t-1])                      (əsas valyutada)

2. Hər alət üçün seçilmiş GARCH spesifikasiyası, sabit orta ilə:
   e[i,t] = r[i,t] - m[i]
   GJR nümunəsi: s2[i,t] = w + (a + g*1{e[i,t-1]<0}) * e[i,t-1]^2 + b*s2[i,t-1],   a + b + g/2 < 1

3. z[i,t] = e[i,t] / sqrt(s2[i,t])

4. DCC(1,1):
   Q[t] = (1-A-B)*Qbar + A*z[t-1]z[t-1]' + B*Q[t-1]
   R[t] = diag(Q[t])^(-1/2) * Q[t] * diag(Q[t])^(-1/2)
   Qbar: z-lərin Ledoit-Wolf korrelyasiya matrisi;  A, B >= 0, A + B < 1;  QML (iki mərhələli DCC-nin ikinci mərhələsi)

5. u[t] = R[t]^(-1/2) * z[t]
   Simmetrik (spektral) kvadrat kök istifadə olunur; Cholesky alətlərin sırasından asılıdır.
   Hovuz: qiymətləndirmə pəncərəsindəki, bütün alətlərin məlumatı olan günlər.

6. Parametr qeyri-müəyyənliyi:
   K parametr dəsti (default K = 200) robust (Bollerslev-Wooldridge) kovariasiyalı asimptotik normal paylanmadan çəkilir.
   Stasionarlıq və müsbətlik şərtini pozan dəstlər atılır. Hər dəstə S/K ssenari düşür.

7. Hər ssenari və h = 1..H üçün:
   a. Təsadüfi tarix tau seçilir (bərabər ehtimalla) və bütün vektor u[tau] götürülür (bütün alətlər birlikdə)
   b. z*[h] = R*[h]^(1/2) * u[tau]           (R*[h] ssenari daxilində DCC rekursiyası ilə hesablanır)
   c. e*[i,h] = sqrt(s2*[i,h]) * z*[i,h];    r*[i,h] = mu[i] + e*[i,h]
   d. s2* və Q* növbəti gün üçün simulyasiya edilmiş e* və z* ilə yenilənir
      (beləcə böyük düşmədən sonra həmin ssenaridə volatillik artır)
   e. P*[i,h] = P*[i,h-1] * exp(r*[i,h]);    V*[h] = sum_i n[i] * P*[i,h] + nağd pul

8. Drift: mu[i] = (rf + beta[i]*MRP)/252 - 0.5*s2bar[i]   (s2bar: uzunmüddətli gündəlik dispersiya)
   Həssaslıq variantı: mu[i] = 0. rf və MRP admin parametrləridir (valyutaya görə).

9. Çıxış: V[S,H], P[S,H,N]. Seed snapshot-da saxlanılır.
```

Performans üçün vektorlaşdırılmış numpy istifadə et (lazım olsa numba; matris kökləri üçün toplu `eigh`). Tam simulyasiya massivi frontend-ə göndərilmir. Yalnız persentillər, ehtimallar və 5–10 nümunə ssenari göndərilir.

### 5.4 Risk ölçüləri

- Portfel və hər alət üçün hər gün: 5, 25, 50, 75, 95 persentillər.
- Aralıq nöqtələrdə: median, 50%/90% aralıqlar, itki ehtimalı, 5%/10%/20%-dən çox itki ehtimalları.
- Dövrün sonunda VaR və CVaR (95%, 99%), faizlə və pulla:
  - VaR(α) = −q₁₋α (gəlirin (1−α) kvantilinin mənfi işarəlisi);
  - CVaR(α) = VaR sərhədindən pis ssenarilərin orta itkisi.
- Dövr ərzində: max drawdown paylanması, aşma əyrisi və ilk keçid ehtimalı P(min_h V[h]/V0 − 1 ≤ −x).
- Hər alət üçün hədəf qiymət ehtimalı P(P[H] ≥ hədəf). İstəyə görə dövr ərzində hədəfə toxunma ehtimalı.
- Euler bölgüsü: component CVaR_i = −E[PnL_i | PnL_portfel ≤ −VaR95]. Komponentlərin cəmi portfelin CVaR-ına bərabərdir.
- Mənfəət/zərər təxminləri (bölmə 3.4).

### 5.5 Stress testləri

- Tarixi ssenarilər: 2008-ci ilin 4-cü rübü, 2020-ci ilin fevral–mart düşüşü, 2022-ci il. Məlumat həmin dövrü əhatə edirsə, faktiki gəlirlər tətbiq olunur. Əhatə etmirsə: beta × bazar indeksinin həmin dövrdəki hərəkəti.
- Hipotetik ssenarilər: bazar −20%, faiz +100 bp, neft −30%. Təsir = Σ_k beta[i,k] × şok[k] (çoxfaktorlu OLS, HAC standart xətaları ilə).
- Nəticə: portfel və hər alət üzrə itki, faizlə və pulla. Stress nəticələri ehtimal kimi təqdim edilmir.

---

## 6. Statistik validasiya (yalnız admin üçün)

Bu bölmədə **çox dərin statistikaçı kimi** davran. Məqsəd modellərin verdiyi aralıqların bütün statistik tələblərə uyğun, kalibrlənmiş və dəqiq olduğunu sübut etməkdir. Sübut etmək mümkün deyilsə, pozuntuları açıq göstər.

### 6.1 Məlumatın və gəlirlərin diaqnostikası

- Təsviri statistika: orta, standart sapma, asimmetriya, ekses kurtozis, min/max, müşahidə sayı, boş günlər.
- Stasionarlıq: ADF **və** KPSS birlikdə. Onların sıfır fərziyyələri əksdir, nəticələri birgə şərh et.
- Normallıq: Jarque-Bera və Anderson-Darling.
- Avtokorrelyasiya: Ljung-Box (gəlirlər və onların kvadratları, bir neçə lag).
- ARCH effekti: Engle ARCH-LM.
- Dispersiyada struktur qırılmalar: ICSS (Inclán-Tiao) və ya CUSUM of squares. Bunun nəticəsi qiymətləndirmə pəncərəsinin seçiminə təsir edir.

### 6.2 Univariate GARCH diaqnostikası (hər alət üçün)

- Parametrlər və robust (Bollerslev-Wooldridge) standart xətalar.
- Stasionarlıq (a + b + g/2 < 1) və müsbətlik şərtləri; davamlılıq və şokun yarımömrü: ln 0.5 / ln(davamlılıq).
- Spesifikasiya seçimi: BIC (AIC də göstərilir). İç-içə modellər üçün LR testi (məsələn, GJR modelində g = 0 fərziyyəsi).
- Standartlaşdırılmış qalıqlar: Ljung-Box (z və z² üçün; z² üçün sərbəstlik dərəcəsi düzəlişi ilə) və ya Li-Mak testi.
- Asimmetriya: Engle-Ng sign bias, negative size bias, positive size bias və birgə test.
- Paylanmanın uyğunluğu: qalıqların seçilmiş paylanmaya görə PIT-i üzərində Pearson goodness-of-fit, Kolmogorov-Smirnov və Anderson-Darling; QQ-plot.
- Parametr sabitliyi: Nyblom-Hansen testi (mümkünsə) və ya alt dövrlərdə yenidən qiymətləndirmə.

### 6.3 Çoxölçülü diaqnostika

- Sabit korrelyasiya testi: Engle-Sheppard (2001). DCC və CCC arasında seçim bu testə əsaslanır.
- DCC parametrləri və onların əhəmiyyətliliyi; A + B < 1 şərti.
- Korrelyasiyadan təmizlənmiş şoklar u[t]: u və u² üçün çoxölçülü portmanteau testi (Hosking və ya Li-McLeod); u-nun nümunə korrelyasiya matrisinin vahid matrisə yaxınlığı.
- Ledoit-Wolf shrinkage intensivliyi; bütün korrelyasiya matrislərinin müsbət müəyyən olması.

### 6.4 Backtest dizaynı

- Rolling-origin: məlumatın uzunluğundan asılı olaraq son 1–3 ilin hər ay sonu. Hər başlanğıc tarixində modellər **yalnız o tarixə qədərki məlumatla** yenidən qurulur. Look-ahead bias olmamalıdır: alət dəsti və parametrlər o tarixdə məlum olanlardır.
- İki növ proqnoz yoxlanılır:
  - günlük 1 addımlı VaR 95%/99% və ES 97.5%;
  - 63 günlük paylanma (portfel və hər alət üçün).
- 63 günlük pəncərələr üst-üstə düşür və avtokorrelyasiyalıdır. Ona görə test statistikaları üçün HAC (Newey-West, lag ≥ H−1) və ya blok bootstrap istifadə et. Nəticəni üst-üstə düşməyən alt nümunədə də yoxla.

### 6.5 Proqnoz qiymətləndirməsi testləri

- **VaR:**
  - Kupiec POF (şərtsiz əhatə);
  - Christoffersen müstəqillik və şərti əhatə testləri;
  - Engle-Manganelli Dynamic Quantile (DQ) testi;
  - Basel svetofor yanaşması: 99% VaR, 250 gün; yaşıl 0–4, sarı 5–9, qırmızı ≥ 10 aşım.
- **ES:** McNeil-Frey (aşım qalıqları, bootstrap) və Acerbi-Szekely Z2.
- **Paylanma (density):**
  - PIT-lərin bərabər paylanması (KS/AD; asılılıq səbəbindən ehtiyatla şərh et);
  - Berkowitz LR testi;
  - kalibrasiya əyrisi: 1%–99% səviyyələrində nominal və faktiki əhatə, inam zolağı ilə.
- **63 günlük aralıqlar:** 50/80/90/95/98% aralıqların faktiki əhatəsi, HAC və ya blok bootstrap inam intervalı ilə.
- **Skorlama qaydaları:** CRPS (ssenarilərdən), log score, quantile (pinball) loss, VaR/ES cütü üçün FZ0 loss (Fissler-Ziegel; Patton-Ziegel-Chen).
- **Volatillik:** QLIKE və MSE (reallaşmış dispersiya proksisinə qarşı); Mincer-Zarnowitz regressiyası (kəsişmə = 0, meyl = 1; HAC standart xətaları ilə).
- **Model müqayisəsi:**
  - Diebold-Mariano (HAC, Harvey-Leybourne-Newbold kiçik nümunə düzəlişi ilə);
  - Model Confidence Set (Hansen-Lunde-Nason; `arch.bootstrap.MCS`);
  - istəyə görə SPA testi.

### 6.6 Çoxlu test nəzarəti və testlərin gücü

- Hər alət üzrə çoxlu test aparılır. Onları Benjamini-Hochberg (FDR) ilə düzəlt və həm xam p-dəyərini, həm q-dəyərini göstər.
- Testlərin gücünü şərh et. Məsələn, 250 müşahidədə 99% VaR üçün Kupiec testinin gücü aşağıdır. "Rədd edilmədi" o demək deyil ki, "model düzgündür".
- Yalnız p-dəyərlərə baxma, effekt ölçülərini də göstər: faktiki əhatə ilə nominal əhatənin fərqi, loss fərqləri və s.

### 6.7 Monte Carlo və parametr xətası

- Kvantil təxminlərinin Monte Carlo standart xətasını hesabla (batch means və ya bootstrap). S-i adaptiv artır: VaR95 və CVaR95 üçün nisbi MC xətası 1%-dən az olana qədər (yuxarı hədd config-də, məsələn 50 000).
- Parametr qeyri-müəyyənliyini (bölmə 5.3, addım 6) backtest-də yoxla: onunla və onsuz əhatəni müqayisə et.
- Admin üçün VaR və CVaR-ın özünə inam intervalı ver (parametr dəstləri üzrə paylanmadan).

### 6.8 Qəbul meyarları (gate-lər)

Model yalnız bu şərtləri ödəyəndə "keçdi" sayılır. Hədlər config-də olur, default əhəmiyyətlilik səviyyəsi 5%-dir:

1. Günlük VaR 95% və 99%: Kupiec, Christoffersen CC və DQ testlərində p ≥ 0.05.
2. Basel svetoforu: yaşıl zona.
3. ES testi: p ≥ 0.05.
4. Berkowitz testi: p ≥ 0.05, və ya pozuntunun səbəbi sənədləşdirilib.
5. 63 günlük 50% və 90% aralıqlar: nominal səviyyə faktiki əhatənin 95% inam intervalının içindədir.
6. Seçilmiş model 90%-lik Model Confidence Set-in içindədir (FZ0 və ya CRPS üzrə).
7. VaR95 və CVaR95 üçün nisbi MC xətası 1%-dən azdır.

Bir gate daxilində bir neçə test aparılırsa, düzgün model də təsadüfən "keçmədi" ala bilər. Bunun qarşısını almaq üçün gate daxilindəki testlər ailəsinə Holm düzəlişi tətbiq et (FWER 5%). Həm düzəlişli, həm düzəlişsiz nəticəni göstər.

**Gate keçilmədikdə bu ardıcıllıqla hərəkət et:**

1. Növbəti spesifikasiyanı və ya rəqib modeli sına.
2. Parametr qeyri-müəyyənliyini əlavə et.
3. Adaptive conformal kalibrləmə tətbiq et.
4. Model yenə keçmirsə: müştəri etibarlılığı "aşağı" görür; 99% göstəriciləri gizlədilir və ya xəbərdarlıqla göstərilir; admin xəbərdarlıq alır.

Heç bir halda gate-dən keçməyən modeli müştəriyə "etibarlı" kimi göstərmə.

### 6.9 Metodun sintetik məlumatla yoxlanması

Real məlumata keçməzdən əvvəl metodun özünü yoxla:

- Parametrləri məlum olan GJR-GARCH-DCC prosesindən sintetik məlumat yarat və parametrlərin nə qədər düzgün bərpa olunduğunu ölç (bias, RMSE).
- Coverage study: yüzlərlə sintetik təkrarda 50% və 90% aralıqların faktiki əhatəsi nominala uyğun olmalıdır (binomial inam intervalı daxilində).
- Testlərin I növ xətasını yoxla: model düzgün olanda rədd etmə tezliyi ~5% olmalıdır. Testlərin gücünü də yoxla: model səhv olanda rədd etmə tezliyi nə qədərdir?

### 6.10 Admin hesabatı və gizlilik

- Hər run üçün admin hesabatı yaradılır: HTML və JSON formatında, `admin_reports/<portfolio_id>/<run_id>/` qovluğunda. Hesabat admin panelində də görünür.
- Hesabatın strukturu:
  1. yekun qərar: keçdi / şərti / keçmədi;
  2. gate-lər cədvəli;
  3. məlumatın keyfiyyəti;
  4. hər alət üzrə model və diaqnostika;
  5. çoxölçülü diaqnostika;
  6. backtest nəticələri;
  7. modellərin müqayisəsi;
  8. MC və parametr xətası;
  9. məhdudiyyətlər və tövsiyə olunan model dəyişiklikləri.
- Hər test üçün göstərilir: H0, statistika, p-dəyəri, q-dəyəri, qərar və şərh.
- **Gizlilik server tərəfində təmin olunur.** Müştəri API cavablarında diaqnostika, test statistikaları, p-dəyərləri və model parametrləri olmamalıdır. Bu məlumatları göndərib yalnız CSS ilə gizlətmək qadağandır. Admin endpoint-ləri yalnız admin roluna açıqdır və bunun üçün avtomatik testlər yazılır.
- Müştəri yalnız sadə etiket görür: etibarlılıq "yüksək / orta / aşağı / yoxlanılır" və bir cümləlik izah.

---

## 7. Tövsiyələr

### 7.1 Risk əsaslı tövsiyələr (MVP, həmişə işləyir)

- **Risk limiti:** müştəri portfel üçün 3 ayda qəbul etdiyi maksimum itkini (CVaR 95%) seçir. Seçməzsə, risk profilinə görə default götürülür (konservativ / mötədil / aqressiv). Default dəyərləri Bahman təsdiqləyəcək (bölmə 15).
- **Payına nisbətən çox risk:** CVaR töhfəsinin çəkiyə nisbəti hədddən yuxarıdırsa (default 1.5), mövqeni azaltmağı təklif et. Azaltma miqdarını marjinal töhfələrlə hesabla.
- **Limit aşımı:** portfelin CVaR-ı limiti keçirsə, riski ən səmərəli azaldan satışları göstər: satılan hər pul vahidinin riski ən çox azaltdığı mövqeləri.
- **Konsentrasiya:** tək mövqe 20%-dən (config), eyni klaster 40%-dən (config) çox olduqda diversifikasiya təklif et.
- **Stress həssaslığı:** ssenari itkisi limiti keçirsə, buna səbəb olan mövqeləri göstər.
- **Hədəf və stop-loss yoxlaması** (müştəri daxil edirsə): hədəfə çatma ehtimalını göstər. Stop-loss 50% aralığın içindədirsə, adi dalğalanmada tez-tez işə düşəcəyi barədə xəbərdarlıq et.
- **Monitorinq:** faktiki qiymət 90% aralıqdan çıxanda bildiriş göndər: "mövqeyə yenidən baxın". Bu, avtomatik satış deyil.
- Hər tövsiyədə göstərilir:
  - hərəkət: artır / azalt / saxla / diqqət;
  - miqdar: səhm sayı və pul;
  - sadə Azərbaycan dilində səbəb;
  - tövsiyədən əvvəl və sonra portfelin CVaR-ı;
  - etibarlılıq etiketi.

### 7.2 Siqnal əsaslı tövsiyələr (Mərhələ B, feature flag və gate ilə)

- LightGBM ilə 1–3 aylıq nisbi gəlirə görə sıralama. Göstəricilər: momentum (12-1), qısa müddətli geri dönmə, volatillik, beta, drawdown. Fundamental məlumat varsa: qiymətləndirmə, keyfiyyət, mənfəət proqnozlarındakı dəyişikliklər.
- Model eyni bazarın geniş səhm dəsti üzərində öyrədilməlidir, çünki portfeldəki səhmlər öyrənmək üçün kifayət deyil.
- Etalon: sadə faktor balı (momentum + aşağı volatillik). ML modeli etalondan yaxşı olmalıdır. Ölçü: IC (Spearman) və onun sabitliyi.
- Validasiya:
  - purged və embargo-lu walk-forward test;
  - real xərclər və slippage;
  - Deflated Sharpe Ratio;
  - sadə etalonlarla müqayisə: mövcud portfeli saxlamaq, bərabər çəki, momentum;
  - 3–6 ay real pul olmadan sınaq (paper trading).
- Portfelin qurulması: siqnallar Black-Litterman-a "fikir" kimi daxil olur (inam IC-yə görə). Kovariasiya DCC proqnozundan götürülür. Optimallaşdırmada CVaR limiti, mövqe və dövriyyə limitləri və xərclər nəzərə alınır.
- Gate-lərdən keçməyənə qədər müştəriyə göstərilmir, yalnız admin görür.

### 7.3 Reinforcement Learning (Mərhələ C, istəyə bağlı)

RL yalnız portfelin yenidən balanslaşdırılma siyasəti üçün rəqib model kimi istifadə olunur. Xərcləri çıxdıqdan sonra modelin görmədiyi məlumatda klassik optimallaşdırmadan statistik olaraq yaxşı nəticə verməsə, istifadə olunmur.

### 7.4 Uyğunluq

- Hər tövsiyə ekranında bu mətn göstərilir: "Bu, investisiya məsləhəti deyil; qərar verməyə kömək edən təhlildir. Nəticələr zəmanət deyil, ehtimaldır."
- Müştəriyə göstərilən hər tövsiyə audit log-da saxlanılır: nə göstərilib, nə vaxt, hansı model versiyası və snapshot ilə.
- Kommersiya rejiminə keçəndə operatorun məsuliyyəti: Azərbaycanın "Qiymətli kağızlar bazarı haqqında" qanununda investisiya məsləhəti lisenziyalı investisiya xidmətləri sırasında sayılır. Real müştərilərə fərdi tövsiyə verməzdən əvvəl hüquqi yoxlama aparılmalıdır.

---

## 8. Müştəri interfeysi

### 8.1 Səhifələr

- Giriş, qeydiyyat, parolun bərpası.
- Portfellər siyahısı: yaratmaq, adını dəyişmək, kopyalamaq, silmək. Hər portfel üçün son Generate tarixi və vəziyyəti göstərilir.
- Portfel redaktoru:
  - əməliyyatlar cədvəli;
  - simvol axtarışı (autocomplete) ilə səhm əlavə etmək;
  - say, tarix və qiymət sahələri (bölmə 3.2 qaydaları ilə; sistemin istifadə etdiyi dəyərlər aydın göstərilir);
  - satış əlavə etmək;
  - CSV idxalı (aktivdirsə);
  - **Generate** düyməsi və "köhnəlib" banneri.
- Nəticələr dashboard-u (8.2).
- Tövsiyələr səhifəsi (7.1).
- Parametrlər: əsas valyuta, risk profili və limiti.

### 8.2 Dashboard bölmələri (bu sırada)

Dashboard üç suala ardıcıl cavab verir: harada olacağam → ən pis halda nə qədər itirə bilərəm → bu rəqəmlərə nə qədər etibar etmək olar.

0. **Başlıq və filtrlər** (bir sətirdə, yuxarıda): məlumat tarixi, dövrün son tarixi, valyuta; aralıq tarix seçimi, VaR səviyyəsi (95/99), məbləğ/% keçidi, səhm seçimi.
1. **Göstərici kartları:** cari dəyər; cari mənfəət/zərər; dövrün sonunda median dəyər və mənfəət/zərər; 90% aralıq; VaR 95% və CVaR 95% (pulla, faizlə və tezlik dilində: "hər 20 rübdən 1-də"); mənfəətdə olma ehtimalı.
2. **Günlük fan chart:** son 6–12 ayın faktiki dəyəri; "bu gün" xətti; 90% (açıq) və 50% (tünd) zolaqlar; median; 5–10 nümunə ssenari (söndürmək olar); **maya dəyəri xətti**. Tooltip həmin gün üçün bütün persentilləri göstərir.
3. **Aralıq tarixlər cədvəli.**
4. **Mənfəət/zərər:** mövqelər üzrə cari və təxmini mənfəət/zərər aralıqları, mənfəətdə olma ehtimalı, break-even ehtimalı.
5. **Dövrün sonunda paylanma:** histogram; VaR-dan pis quyruq vurğulanır; VaR və CVaR xətləri.
6. **Drawdown:** aşma əyrisi.
7. **Səhmlər:** interval qrafiki (median nöqtə, qalın xətt 50%, nazik xətt 90%), sıralana bilən cədvəl, hədəf qiymət kalkulyatoru.
8. **Risk töhfəsi:** dumbbell qrafiki (çəki → CVaR töhfəsi).
9. **Korrelyasiya:** klasterlərə görə sıralanmış heatmap (−1 mavi, 0 boz, +1 qırmızı).
10. **Stress testləri:** sıralanmış üfüqi barlar, "ssenaridir, ehtimal deyil" qeydi ilə.
11. **Etibarlılıq:** yalnız sadə etiketlər (bölmə 12).
12. **Fərziyyələr və lüğət** (bölmə 12).

### 8.3 Dizayn qaydaları

- Hər yerdə eyni təriflər: eyni dövr, eyni aralıqlar, eyni valyuta. Bütün rəqəmlər bir run-dan götürülür.
- Rəng funksiyaya görə seçilir:
  - miqdar üçün bir rəngin çalarları;
  - müsbət/mənfi üçün iki əks rəng və ortada neytral boz;
  - status üçün ayrıca rənglər, həmişə ikon və yazı ilə.
- Çox səhm üçün çox rəng istifadə olunmur: vacib olan vurğulanır, qalanı boz olur.
- İki y oxu olan qrafik olmur. Hər qrafikin cədvəl görünüşü var. Tooltip dəyəri görməyin yeganə yolu deyil, qrafiklər klaviatura ilə də işləyir.
- Xətlər nazik, şəbəkə xətləri solğun və bütöv olur. Rəqəmlər yalnız vacib nöqtələrdə yazılır, mətn neytral rəngdə olur.
- Saxta dəqiqlik olmur: 1 017 000 $ yazılır, faizlər bir onluq rəqəmlə.
- Tünd rejim olur, rəng palitrası rəng korluğuna görə yoxlanılır, səhifə mobil ekranda düzgün görünür.
- Median "proqnoz qiymət" adlanmır.

---

## 9. Admin paneli

- Bütün run-lar: portfel, müştəri, tarix, vəziyyət, gate-lərin nəticəsi.
- Run detalları: bölmə 6.10-dakı tam hesabat və onu yükləmək imkanı (HTML/JSON).
- Xəbərdarlıqlar: keçməyən gate-lər, məlumat problemləri, provayder xətaları, limit aşımları.
- Parametrlər: rf və MRP (valyutaya görə), gate hədləri, risk profillərinin default-ları, feature flag-lər (CSV idxalı, siqnal modeli).
- İstifadəçilərin idarə edilməsi: bloklama, rol təyini.
- Provayderin vəziyyəti: son yeniləmə, sorğu limitlərinin istifadəsi.

---

## 10. Arxitektura və texnologiyalar

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic. Verilənlər bazası: inkişaf zamanı SQLite, istehsalda PostgreSQL (eyni ORM ilə).
- **Məlumat:** yfinance (dəqiq versiya ilə sabitlənmiş).
- **Analitika:** numpy, pandas, scipy, statsmodels, arch (GARCH və `bootstrap.MCS`), scikit-learn (Ledoit-Wolf, klasterləşmə), exchange_calendars, lazım olsa numba. Mərhələ B üçün lightgbm və hmmlearn.
- **Fon işləri:** ayrıca worker prosesi. Windows-da inkişaf üçün verilənlər bazası əsaslı sadə növbə. İstehsalda (Linux serverdə) Redis + RQ və ya Celery. Hər işin vəziyyəti və addımları UI-a ötürülür.
- **Frontend:** React + TypeScript + Vite; qrafiklər üçün Apache ECharts və ya Plotly.js; i18n (default dil Azərbaycan dili). Daha sadə alternativ: FastAPI + Jinja2 + HTMX. Seçimi bölmə 15-də Bahman-dan soruş.
- **Təhlükəsizlik:**
  - parollar argon2 ilə hash olunur;
  - HTTP-only, Secure, SameSite cookie-lər və CSRF qorunması;
  - sorğu limiti (rate limiting);
  - server tərəfində rol əsaslı giriş (client/admin) və hər sorğuda portfelin sahibinin yoxlanması;
  - input validasiyası;
  - sirlər yalnız `.env` faylında saxlanılır və git-ə düşmür;
  - audit log; asılılıqların versiyaları sabitlənir; istehsalda HTTPS.
  - Portfel məlumatı şəxsi maliyyə məlumatıdır: qorunmalıdır, müştəri hesabını və məlumatını silə bilməlidir.
- **Konfiqurasiya:** `config.yaml` (dövr, ssenari sayı, səviyyələr, gate hədləri, default limitlər, seed) və `.env` (API açarları, verilənlər bazasının yolu, secret key).

### 10.1 Qovluq strukturu

```text
Portfoilo analysis project/
├─ CLAUDE.md
├─ PROMPT.md
├─ README.md               # Azərbaycan dilində: quraşdırma, işə salma, istifadə
├─ config.yaml
├─ .env.example
├─ docs/                   # decisions.md, architecture.md, statistics.md, reports/
├─ backend/
│  ├─ app/                 # api, auth, db models, schemas, services
│  ├─ data/                # providers (api, csv_investing, csv_generic), cache, calendars, quality
│  ├─ portfolio/           # transactions, lots (FIFO), pnl, snapshot
│  ├─ risk/                # diagnostics, garch, dcc, simulate, measures, stress, attribution
│  ├─ validation/          # backtest, var/es/density tests, scoring, mcs, gates, report
│  ├─ recommend/           # risk_based; signal_based və rl (mərhələ B/C)
│  ├─ jobs/                # queue, worker
│  └─ tests/
├─ frontend/               # React + TypeScript
├─ admin_reports/          # git-ə düşmür
├─ data_cache/             # git-ə düşmür
└─ scripts/                # Windows üçün PowerShell skriptləri (setup, run)
```

### 10.2 Windows və OneDrive qeydləri

- Yolda boşluqlar var: PowerShell-də və Python-da yolları həmişə dırnaqla yaz, Python-da `pathlib` istifadə et.
- OneDrive sinxronizasiyası SQLite faylını və minlərlə kiçik faylı (`.venv`, `node_modules`) bloklaya və ya konflikt yarada bilər. Ona görə:
  - verilənlər bazasının və keşin yolu `.env` ilə dəyişdirilə bilsin;
  - README-də bu riski izah et və qovluq üçün "Always keep on this device" seçimini tövsiyə et;
  - SQLite-da WAL rejimini aç və "database is locked" xətası üçün retry əlavə et.
- Uzun yollar üçün `git config core.longpaths true`.
- Bir komanda ilə işə salma skripti: `scripts/run_dev.ps1` (backend, worker və frontend birlikdə).
- Git repozitoriyası yarat. `.gitignore`-a daxil et: `.env`, `.venv`, `node_modules`, `data_cache/`, `admin_reports/`, `*.db`.

---

## 11. Testlər

- **Unit (pytest):**
  - daxiletmə qaydaları (bölmə 3.2);
  - FIFO və mənfəət/zərər, split düzəlişi;
  - CSV parser (investing.com formatının müxtəlif variantları), FX çevirməsi, ticarət təqvimləri;
  - risk ölçüləri (analitik cavabı məlum olan paylanmalarla müqayisə).
- **Property-based (hypothesis):**
  - FIFO invariantları: satılan say mövcud saydan çox ola bilməz, maya dəyəri itmir;
  - Euler töhfələrinin cəmi portfelin CVaR-ına bərabərdir.
- **Statistik (bölmə 6.9):** parametrlərin bərpası, coverage study, testlərin I növ xətası və gücü.
- **İnteqrasiya:** qeydə alınmış Yahoo cavabları (fixture) ilə tam Generate axını. Testlərdə Yahoo-ya və ya hər hansı API-yə canlı sorğu olmur.
- **Mənbə dayanıqlığı:** Yahoo xəta qaytaranda (rate limit, boş cavab, dəyişmiş format) proqram çökmür, keşlə işləyir və aydın mesaj verir.
- **Təhlükəsizlik:**
  - müştəri başqa müştərinin portfelini və admin endpoint-lərini görə bilmir;
  - müştəri API cavablarında diaqnostika sahələri yoxdur.
- **Frontend (Playwright):** qeydiyyat → portfel yaratmaq → səhm əlavə etmək → Generate → dashboard. Portfeli dəyişəndə "köhnəlib" banneri görünür.
- **Performans:** 30 səhmli portfel üçün Generate (sürətli yol) vaxtı ölçülür.

---

## 12. Müştəriyə izah qaydaları (interfeys mətnləri)

- VaR və CVaR ayrıca model deyil, ssenarilərdən çıxarılan risk ölçüləridir. 10 000 ssenari ən pisdən ən yaxşıya doğru sıralanır:
  - VaR 95% = 500-cü ən pis nəticə (pis zonanın sərhədi);
  - CVaR 95% = ən pis 500 nəticənin ortası (pis zonanın dərinliyi).
- 50% və 90% aralıqlar ortadakı ssenarilərdir. Tezlik dilində: faktiki nəticə təxminən hər iki haldan birində 50% aralığın, 10 haldan birində isə 90% aralığın kənarına çıxır. Bu normaldır.
- Median adətən bugünkü qiymətə yaxın olur. Əsas dəyərli məlumat aralıqlarda və ehtimallardadır.
- Dövr ərzində müəyyən səviyyəyə toxunma ehtimalı adətən dövrün sonunda həmin səviyyədə olma ehtimalından təxminən iki dəfə yüksək olur.
- Etibarlılıq etiketləri:
  - aralığın eni və portfel üzrə nəticələr: adətən yüksək;
  - ayrı səhmlər: orta;
  - ekstremal hallar (99%): orta-aşağı;
  - median (istiqamət): aşağı.
- "Zəmanət", "mütləq qalxacaq" kimi ifadələr heç vaxt işlədilmir.

---

## 13. Bahman-a hesabat qaydası

Hər mərhələnin sonunda və statistik validasiyadan sonra Azərbaycan dilində hesabat ver:

1. Nə quruldu və nə test olundu (qısa).
2. Statistik nəticələr:
   - gate-lər cədvəli (keçdi/keçmədi);
   - əsas testlər: H0, statistika, p- və q-dəyəri, qərar;
   - effekt ölçüləri və testlərin gücü haqqında qeyd.
3. Dərin şərh: nəticələr modelin hansı fərziyyəsini təsdiqləyir və ya pozur, bu, aralıqların dəqiqliyinə necə təsir edir.
4. Problemlər və tövsiyə olunan dəyişikliklər (prioritetə görə).
5. Növbəti addımlar və Bahman-dan gözlənilən qərarlar.

Hesabatı `docs/reports/<tarix>-<mərhələ>.md` faylında da saxla.

---

## 14. Mərhələlər

| Mərhələ | Məzmun | Bitmə meyarı |
|---|---|---|
| M0 | Açıq suallar, plan, repo skeleti, config, skriptlər | Bahman planı təsdiqləyib |
| M1 | Məlumat qatı: provayder interfeysi, Yahoo (yfinance) adapteri, simvol xəritəsi, CSV idxalı, keş, simvol axtarışı, FX, təqvimlər, keyfiyyət yoxlamaları | Unit testlər keçir; nümunə simvollar üçün məlumat yüklənir |
| M2 | Portfel və əməliyyatlar: çox portfel, daxiletmə qaydaları, FIFO, mənfəət/zərər, snapshot, API | Unit və property testlər keçir |
| M3 | Risk mühərriki: diaqnostika, GARCH seçimi, DCC, FHS + parametr qeyri-müəyyənliyi, risk ölçüləri, mənfəət/zərər təxminləri, stress testləri | Sintetik coverage study uğurludur |
| M4 | Validasiya: backtest, bütün testlər, MCS, gate-lər, conformal kalibrləmə, admin hesabatı | Nümunə portfellər üçün tam hesabat hazırdır; Bahman statistik hesabatı alıb |
| M5 | Risk əsaslı tövsiyələr | Tövsiyələrin testləri keçir; əvvəl/sonra CVaR düzgün hesablanır |
| M6 | Frontend: müştəri interfeysi və admin paneli | Playwright testləri keçir |
| M7 | Təhlükəsizlik, sənədləşmə (README Azərbaycan dilində), Windows skriptləri, son yoxlama | Təhlükəsizlik testləri keçir; Bahman qəbul edib |
| M8 | Mərhələ B: siqnal modeli və Black-Litterman optimallaşdırması | Validasiya gate-lərindən keçib (əks halda söndürülü qalır) |
| M9 | Mərhələ C: RL rəqib modeli (istəyə bağlı) | Klassik optimallaşdırmadan statistik olaraq yaxşıdır |

---

## 15. Kod yazmazdan əvvəl Bahman-dan soruşulacaq suallar

1. Əsas mənbə Yahoo Finance-dir (`yfinance`), qərar verilib. Soruş: hansı birjaların səhmləri olacaq (Yahoo şəkilçi cədvəli üçün)?
2. Hansı birjalar və valyutalar lazımdır? Əsas valyutanın default-u nə olsun (USD, AZN, EUR)?
3. Hosting: əvvəlcə yalnız lokal, yoxsa server və domen?
4. Frontend: React + TypeScript, yoxsa daha sadə Jinja2 + HTMX?
5. Risk profilləri üçün default limitlər (3 aylıq CVaR 95%) və konsentrasiya hədləri.
6. Komissiya və vergi nəzərə alınsınmı? Fraksiyalı səhmlərə icazə verilsinmi?
7. CSV idxalı kimlər üçün aktiv olsun (yalnız admin?).
8. Brend adı və interfeys dilləri.
9. rf və MRP üçün mənbə və dəyərlər.

---

## 16. Qadağalar

- investing.com-u scrape etmək və ya bot qorumasını keçmək.
- Yahoo mənbəyini `commercial` rejimində istifadə etmək; Yahoo-ya paralel və ya tez-tez sorğu göndərmək.
- Normal paylanma fərziyyəsi ilə qısa yol getmək; aralıqsız nöqtə proqnozu vermək; medianı "proqnoz qiymət" adlandırmaq.
- Diaqnostikanı müştəriyə göstərmək və ya yalnız interfeysdə gizlətmək.
- Look-ahead bias; testlərdə canlı API çağırışları; API açarlarını kodda saxlamaq.
- Gate-lərdən keçməyən modeli "etibarlı" kimi təqdim etmək; zəmanətli gəlir vəd etmək.
- Maya dəyərinə görə tövsiyə vermək (sunk cost).
- Çox səhm üçün çox rəng, iki y oxu olan qrafiklər.

---

## 17. İstinadlar

- [investing.com Terms and Conditions](https://cdn.investing.com/about-us/terms_and_conditions.html)
- [yfinance README (hüquqi xəbərdarlıq)](https://cdn.jsdelivr.net/gh/ranaroussi/yfinance@main/README.md)
- [Portfolio Performance forumu: investing.com-un avtomatik sorğuları bloklaması (2026)](https://forum.portfolio-performance.info/t/investing-com-is-not-allowing-anymore-to-scrape-historical-prices/39537)
- [Gu, Kelly, Xiu — Empirical Asset Pricing via Machine Learning](https://www.nber.org/papers/w25398.pdf)
- [Millea — Deep Reinforcement Learning for Trading: A Critical Survey](https://mdpi-res.com/d_attachment/data/data-06-00119/article_deploy/data-06-00119-v2.pdf)
- [Gort et al. — DRL for Cryptocurrency Trading: Addressing Backtest Overfitting](https://arxiv.org/pdf/2209.05559)
- Metodoloji əsaslar: Glosten-Jagannathan-Runkle (1993); Engle (2002) DCC; Barone-Adesi və b. (1999) FHS; Engle & Sheppard (2001); Ledoit & Wolf (2004); Kupiec (1995); Christoffersen (1998); Engle & Manganelli (2004); Berkowitz (2001); McNeil & Frey (2000); Acerbi & Szekely (2014); Patton, Ziegel & Chen (2019); Diebold & Mariano (1995); Hansen, Lunde & Nason (2011); Gibbs & Candès (2021).
