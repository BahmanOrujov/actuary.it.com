# Qəbul edilmiş qərarlar

> Mənbə: Bahman-ın PROMPT.md bölmə 15-dəki suallara cavabları (2026-10-27).

| # | Sual | Qərar |
|---|---|---|
| 1 | Birjalar | ABŞ (NYSE/NASDAQ, şəkilçisiz) və Avropa: London `.L`, Xetra `.DE`, Paris `.PA`. Şəkilçi cədvəli `config.yaml`-dadır, sonradan genişləndirilə bilər. |
| 2 | Default əsas valyuta | USD. Dəstəklənən valyutalar: USD, EUR, GBP, AZN (AZN üçün `USDAZN=X` yoxdursa sabit 1.70). |
| 3 | Hosting | Yalnız lokal (`APP_MODE = personal`). |
| 4 | Frontend | React + TypeScript + Vite + Apache ECharts. |
| 5 | Risk profilləri (3 aylıq CVaR 95% limiti) | Konservativ 8%, mötədil 15%, aqressiv 25%. Konsentrasiya: tək mövqe 20%, klaster 40%. |
| 6 | Komissiya / vergi / fraksiya | Əməliyyatda istəyə bağlı komissiya sahəsi; vergi nəzərə alınmır; fraksiyalı say 4 onluq rəqəmə qədər. |
| 7 | CSV idxalı | `personal` rejimində bütün istifadəçilər üçün aktiv; `commercial` rejimində avtomatik söndürülür. |
| 8 | Brend və dil | "Portfel Analizi"; yalnız Azərbaycan dili (i18n strukturu ilə). |
| 9 | rf və MRP | USD rf: Yahoo `^IRX` (3 aylıq T-bill), alınmasa config-dəki 4%. EUR rf 2.5%, GBP rf 4%, AZN rf 7%. MRP bütün valyutalar üçün 5%. Admin panelindən dəyişdirilə bilər. |

## Texniki qərarlar (Claude tərəfindən, açıq yazılmış fərziyyələr)

- Fon işləri: SQLite əsaslı sadə növbə, ayrıca `worker` prosesi.
- Autentifikasiya: argon2 hash, HTTP-only SameSite=Lax session cookie, CSRF üçün double-submit token.
- İlk qeydiyyatdan keçən istifadəçi avtomatik `admin` rolu alır (lokal şəxsi rejim üçün).
- Ağır validasiya (rolling backtest) Generate-dən sonra ayrıca fon işi kimi işləyir; ölçüsü config-də (default: son 24 ay sonu).

## Statistik və texniki qərarlar (2026-10-27, audit və canlı yoxlamadan sonra)

- **FHS şok hovuzu mərkəzləşdirilir:** drift yalnız CAPM-dən (və ya "gəlir = 0") gəlir. Robust (Student-t) orta nümunə ortasından fərqlənəndə yaranan əlavə drift aradan qalxır.
- **EGARCH və inteqrasiyaya yaxın GARCH** üçün uzunmüddətli dispersiya nümunədən götürülür (Jensen bərabərsizliyi).
- **Qırılma siyasəti (6.1):** qərar GARCH sup-LR testi ilə verilir (ICSS namizəd tarixi, Andrews null paylanması, alətlər üzrə Holm). Qırılma əhəmiyyətlidirsə və ondan sonra ≥2 il məlumat qalırsa, həmin alətin modeli qırılmadan sonrakı dövrdə qurulur. Xam ICSS və κ2 yalnız məlumat üçündür (GARCH-da ölçü 97% / 58%).
- **Hər alətin GARCH modeli öz tarixçəsində** qurulur; korrelyasiya ortaq dövrdə qurulur. Tarixçə 2 ildən qısadırsa (EWMA) və ya 6 aydan qısadırsa (proksi), müştəri etibarlılığı ≤ "aşağı" olur.
- **Gate 7** (MC dəqiqliyi) və gate 4, 6 "yumşaq" gate-lərdir: yalnız onlar keçməsə, nəticə "şərti" olur. Ssenari sayı hədəfə çatana qədər artırılır.
- **Gate keçilmədikdə addım 1:** GJR-skewt sınanır (Bonferroni α/2). Daha yaxşıdırsa, run həmin spesifikasiya ilə yenidən hesablanır.
- **Validasiya** run-ın dondurulmuş config-i və məlumat tarixi ilə, keşdən işləyir (yeni məlumat görmür).
- **Admin parametrləri** (alpha, valyutaya görə rf və MRP, profil limitləri) Generate anında run-ın snapshot-una dondurulur.
- **Cari mənfəət/zərər kartı** açıq mövqelərin reallaşmamış mənfəət/zərəridir (proqnozla eyni tərif). Reallaşmış mənfəət və dividendlər ayrıca göstərilir.
- **Parol bərpası:** lokal rejimdə birdəfəlik link (30 dəq) server konsoluna yazılır.
- **Proses pool-u** `jobs.max_workers: 3`-dür (7,7 GB RAM).
- **Qeydə alınmış Yahoo fixture-ları** `backend/tests/recorded/` qovluğundadır və git-ə düşmür (Yahoo şərtləri).
- **Playwright E2E:** `@playwright/test` 1.64.0 (dəqiq versiya), sistemdəki Edge (`channel: msedge`) ilə işləyir.

## Giriş təhlükəsizliyi (2026-10-27)

- **Baza, keş və admin hesabatları** default olaraq `%USERPROFILE%\.portfel-analizi\data`-dadır, OneDrive-a sinxronlaşmır. `PA_DATA_DIR` ilə dəyişdirilir; yol OneDrive-dadırsa, server xəbərdarlıq verir.
- **Sessiya tokenləri** bazada SHA-256 hash kimi saxlanılır. Miqrasiya 0002 köhnə sessiyaları sildi.
- **Parol siyasəti:** ən azı 10 simvol, ən azı 5 fərqli simvol; yayılmış/sızmış parollar (leet və rəqəm variantları ilə), ardıcıllıqlar, e-poçt adı qadağandır. Şəbəkə sorğusu yoxdur (HIBP istifadə edilmir). Mövcud parollarla giriş işləyir.
- **Bloklama:** 5 uğursuz cəhd → 15 dəqiqə, hər dəfə ikiqat artır (maks. 24 saat). Qeydiyyatsız e-poçtlar üçün də eyni davranış və eyni cavab vaxtı. Admin kilidi açır, bloklama admin xəbərdarlığı və audit qeydi yaradır.
- **Parol dəyişəndə** digər sessiyalar bağlanır; bərpa və admin parol yeniləməsi bütün sessiyaları bağlayır.
