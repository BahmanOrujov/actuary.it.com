# Portfel Analizi

Səhm portfellərinin 3 aylıq (63 ticarət günü) ehtimal proqnozu, mənfəət/zərər təxmini, risk analizi və risk əsaslı tövsiyələr verən lokal veb tətbiq. Spesifikasiya: [PROMPT.md](PROMPT.md); qəbul edilmiş qərarlar: [docs/decisions.md](docs/decisions.md).

> **Rejim:** `APP_MODE=personal` (şəxsi, lokal). Məlumat mənbəyi Yahoo Finance-dir (`yfinance`); onun şərtləri yalnız şəxsi istifadəyə icazə verir. investing.com-a proqram heç vaxt sorğu göndərmir — investing.com simvolları yalnız identifikator kimi işlədilir, tarixçəni isə istəsəniz özünüz CSV kimi endirib yükləyə bilərsiniz.

## Tələblər

- Windows 10/11, PowerShell 5.1+
- Python 3.11+ (`py -3.11` işləməlidir)
- Node.js 18+ (sınaqdan keçib: v24)

## Quraşdırma (bir dəfə)

```powershell
cd "C:\Users\bahma\OneDrive - ADA University\Desktop\Portfoilo analysis project"
powershell -ExecutionPolicy Bypass -File ".\scripts\setup.ps1"
```

Skript bunları edir:

1. Python mühitini **OneDrive-dan kənarda** yaradır: `%USERPROFILE%\.portfel-analizi\venv` (`PA_VENV` dəyişəni ilə dəyişmək olar).
2. `backend\requirements.txt`-dəki dəqiq versiyaları quraşdırır.
3. `.env` faylını təsadüfi `SECRET_KEY` ilə yaradır.
4. Frontend asılılıqlarını quraşdırır və `frontend\dist`-i build edir.

## İşə salma

**Sadə rejim (tək port, tövsiyə olunur):**

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\run.ps1"
```

Brauzerdə açın: <http://localhost:8000>

**İnkişaf rejimi** (backend + worker + Vite hot-reload birlikdə):

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\run_dev.ps1"
```

Brauzerdə açın: <http://localhost:5173>

Hər iki rejimdə iki proses işləyir: API (`uvicorn`) və fon işçisi (`python -m jobs.worker`). Generate işləri worker-də icra olunur, ona görə worker işləməsə analiz "Növbədədir" vəziyyətində qalır.

## İstifadə

1. **Qeydiyyat.** İlk qeydiyyatdan keçən istifadəçi avtomatik **admin** olur (sizin hesabınız). Sonrakılar müştəri olur.
2. **Portfel yaradın:** ad, əsas valyuta (USD/EUR/GBP/AZN), risk profili.
3. **Səhm əlavə edin:** simvolu investing.com-da göründüyü kimi yazın (`AAPL`, `SAP`, `VOD`…) və "Axtar" basın. Bir neçə birjada varsa, düzgününü seçin.
   - **Say** məcburidir; **tarix** və **qiymət** istəyə bağlıdır:
     | Daxil edilən | Sistem |
     |---|---|
     | say + tarix + qiymət | hər ikisi istifadə olunur; qiymət günün aralığından kənardırsa xəbərdarlıq |
     | say + tarix | həmin günün bağlanış qiyməti (ticarət günü deyilsə, əvvəlki gün) |
     | say + qiymət | tarix = bu gün |
     | yalnız say | bu gün + son bağlanış qiyməti |
   - Satışlar FIFO ilə hesablanır; mövcud saydan çox satmaq olmaz.
4. **Generate** basın. Proqress göstəricisi addımları göstərir (məlumat → yoxlama → modellər → simulyasiya → stress → tövsiyələr). Adətən 30 saniyə – 3 dəqiqə.
5. **Nəticələr** dashboard-u: fan chart, aralıq tarixlər, mənfəət/zərər, VaR/CVaR, drawdown, səhmlər, risk töhfəsi, korrelyasiya, stress testləri, etibarlılıq, lüğət. Hər qrafikin "Cədvəl" görünüşü var.
6. **Tövsiyələr** — risk limitinizə və gələcək riskə əsaslanır (maya dəyərinə yox). Hər tövsiyədə "investisiya məsləhəti deyil" xəbərdarlığı var və audit log-a yazılır.
7. Portfeli dəyişsəniz, köhnə nəticələr **"köhnəlib"** kimi işarələnir — yenidən Generate basın.

Generate-dən sonra arxa planda **statistik validasiya** (rolling backtest, VaR/ES/sıxlıq testləri, MCS, gate-lər) işləyir. Bitənə qədər etibarlılıq etiketi "yoxlanılır" görünür.

### Admin paneli

Yuxarı menyuda **Admin**: bütün run-lar, gate-lər və tam statistik hesabat (HTML/JSON, `%USERPROFILE%\.portfel-analizi\data\reports\<portfolio_id>\<run_id>\`), xəbərdarlıqlar, rf/MRP/limitlər/feature flag-lər, istifadəçilər (bloklama, rol, parol yeniləmə), provayderin vəziyyəti. Müştəri API-si diaqnostika, p-dəyər və model parametrlərini heç vaxt qaytarmır (server tərəfində ayrılıb, testlə yoxlanılır).

### investing.com CSV idxalı (ehtiyat mənbə)

Yahoo-da olmayan səhm üçün: investing.com-un "Historical Data" səhifəsindən CSV-ni **özünüz** endirin → portfel redaktorunda "CSV idxalı" → simvol, birja, valyuta → Yüklə. Sonra həmin simvolu axtarıb əlavə edin. Bu funksiya yalnız `personal` rejimində işləyir.

### Monitorinq bildirişləri

Worker hər 60 dəqiqədən bir son (köhnəlməmiş) təhlilin 90% aralığını faktiki qiymətlə müqayisə edir. Qiymət aralıqdan çıxanda **Bildirişlər** bölməsində "mövqeyə yenidən baxın" mesajı görünür. Bu, avtomatik satış deyil.

### Parolu unutdunuz?

Giriş səhifəsində "Parolu unutmusunuz?" → e-poçt → birdəfəlik link **server konsoluna** yazılır (`run.ps1` pəncərəsi, 30 dəqiqə etibarlıdır). Başqa admin hesabı ilə də Admin → İstifadəçilər → "Parolu yenilə" etmək olar. Konsola baxmaq mümkün deyilsə:

```powershell
cd backend
& "$env:USERPROFILE\.portfel-analizi\venv\Scripts\python.exe" -c "from app.db import SessionLocal; from app.models import User; from app.security import hash_password; s=SessionLocal(); u=s.query(User).filter_by(email='SIZIN@EMAIL').one(); u.password_hash=hash_password('YENI-PAROL'); u.locked_until=None; s.commit()"
```

## Məlumatların yeri və təhlükəsizlik

**Şəxsi məlumatlar OneDrive-da saxlanılmır.** Hesablar, portfellər, qiymət keşi və admin hesabatları default olaraq `%USERPROFILE%\.portfel-analizi\data` qovluğundadır (`app.db`, `cache\`, `reports\`). Layihə qovluğu OneDrive-da olduğu üçün baza oraya qoyulsaydı, buludla sinxronlaşardı. Yeri `.env`-də `PA_DATA_DIR` ilə dəyişmək olar. Yol OneDrive-ın içinə düşərsə, server başlayanda xəbərdarlıq verir. Diskin BitLocker ilə şifrələnməsi tövsiyə olunur.

| Məlumat | Necə saxlanılır |
|---|---|
| Parol | Yalnız Argon2id hash-i (təsadüfi salt) |
| Sessiya | Cookie-də təsadüfi token, bazada yalnız onun SHA-256 hash-i |
| Parol bərpası tokeni | SHA-256 hash, 30 dəqiqə, bir dəfəlik |

- **Parol siyasəti:**
  - ən azı 10 simvol və ən azı 5 fərqli simvol;
  - yayılmış və sızmış parollar qadağandır, "P@ssw0rd2024!" kimi variantlar da tutulur (siyahı: `backend/app/common_passwords.txt`);
  - ardıcıllıqlar (12345678, qwerty), e-poçt adı və tətbiqin adı qadağandır.
  - Köhnə qısa parollarla giriş işləyir; siyasət yeni parollara tətbiq olunur.
- **Giriş cəhdləri:**
  - IP üzrə dəqiqədə 10 cəhd.
  - Hesab 5 uğursuz cəhddən sonra 15 dəqiqəlik bağlanır; hər təkrar bloklamada müddət ikiqat artır, 24 saata qədər.
  - Qeydiyyatsız e-poçtlar da eyni cavabı alır və cavab vaxtı eyni olur, ona görə hesabın mövcudluğu bilinmir.
  - Admin → İstifadəçilər → "Kilidi aç". Bloklama admin xəbərdarlığı yaradır.
- **Parol dəyişəndə** digər cihazlardakı sessiyalar bağlanır.
- **Cookie və sorğular:** cookie-lər `HttpOnly` və `SameSite=Lax`-dır, dəyişiklik edən sorğular CSRF tokeni tələb edir. Server yalnız `127.0.0.1`-də dinləyir.

Bütün parametrlər `config.yaml` → `security` bölməsindədir.

OneDrive kilidlərinə qarşı: SQLite WAL rejimindədir və "database is locked" üçün retry var. `node_modules` üçün layihə qovluğunda **"Always keep on this device"** seçin.

## Testlər

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\test.ps1"
```

Testlərdə canlı API sorğusu yoxdur (deterministik fixture provayder). Əhatə: daxiletmə qaydaları, FIFO/split/FX, CSV parser (US və Avropa formatları), təqvimlər, risk ölçüləri (analitik cavablarla), Euler və FIFO invariantları (hypothesis), sintetik GJR-GARCH/DCC parametr bərpası, coverage study, testlərin I növ xətası və gücü, tam Generate axını, təhlükəsizlik (başqa portfel, admin endpoint-ləri, CSRF), müştəri cavablarında diaqnostika olmaması, provayder xətasında keşlə işləmə.

Böyük sintetik tədqiqat (PROMPT.md 6.9):

```powershell
cd backend
& "$env:USERPROFILE\.portfel-analizi\venv\Scripts\python.exe" -m validation.synthetic --full
```

Qeydə alınmış real Yahoo cavabları ilə inteqrasiya testi (fixture-lar git-ə düşmür):

```powershell
cd backend
& "$env:USERPROFILE\.portfel-analizienv\Scripts\python.exe" -m tests.record_fixtures
```

30 səhmlik Generate vaxtı (sintetik məlumat, ~60 s):

```powershell
cd backend
& "$env:USERPROFILE\.portfel-analizienv\Scripts\python.exe" -m validation.perf 30
```

Frontend E2E (Playwright, app işləyərkən; sistemdəki Microsoft Edge istifadə olunur, brauzer yükləmək lazım deyil):

```powershell
cd frontend
npm run test:e2e
```

## Struktur

```text
config.yaml          bütün model/validasiya parametrləri (kodda sabit rəqəm yoxdur)
.env                 sirlər və yollar (git-ə düşmür)
backend/app          FastAPI, auth, ORM modelləri, servislər, müştəri və admin API
backend/data         MarketDataProvider, Yahoo adapteri, CSV parser, keş, təqvimlər, keyfiyyət
backend/portfolio    daxiletmə qaydaları, FIFO lotlar, snapshot, mənfəət/zərər
backend/risk         diaqnostika, GARCH seçimi, DCC/CCC, FHS simulyasiya, risk ölçüləri, stress, faktorlar
backend/validation   statistik testlər, backtest, gate-lər, conformal, admin hesabatı, sintetik yoxlama
backend/recommend    risk əsaslı tövsiyələr
backend/jobs         DB əsaslı növbə və worker
frontend             React + TypeScript + Vite + ECharts (i18n, tünd rejim)
scripts              setup / run / run_dev / test (PowerShell)
docs                 qərarlar, arxitektura, statistika, hesabatlar
```

## Hüquqi qeyd

Tövsiyələr investisiya məsləhəti deyil; qərar verməyə kömək edən təhlildir. Nəticələr zəmanət deyil, ehtimaldır. Kommersiya rejimində (`APP_MODE=commercial`) Yahoo və investing.com mənbələri avtomatik söndürülür və lisenziyalı provayder tələb olunur; real müştərilərə fərdi tövsiyə verməzdən əvvəl hüquqi yoxlama aparılmalıdır.
