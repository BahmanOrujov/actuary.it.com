# Tam versiyanı Oracle Cloud-da (pulsuz) işə salmaq

Nəticə: `https://<ip>.sslip.io` (və ya öz domeniniz, məsələn `https://app.actuary.it.com`) ünvanında
Portfel Analizinin tam versiyası — öz portfelləriniz, Generate, validasiya, PDF.

## 1. Pulsuz hesab (bunu yalnız siz edə bilərsiniz)

1. <https://www.oracle.com/cloud/free/> → **Start for free**.
2. **Home region** seçin. Sonradan dəyişmək olmur. Pulsuz ARM serverləri (Ampere A1) çox vaxt Avropada
   **Germany Central (Frankfurt)**, **Netherlands Northwest (Amsterdam)**, **UK South (London)** regionlarında olur.
3. Kart təsdiqi tələb olunur (yoxlama üçün kiçik məbləğ bloklanıb geri qaytarılır). "Always Free" limitləri
   daxilində ödəniş yoxdur.

## 2. SSH açarı

Kompüterdə açar artıq hazırlanıb: `C:\Users\bahma\.ssh\oracle_portfel` (gizli) və
`C:\Users\bahma\.ssh\oracle_portfel.pub` (açıq). Növbəti addımda **yalnız `.pub` faylının** məzmunu lazımdır.

## 3. Server yaratmaq

Oracle konsolunda: **Compute → Instances → Create instance**

| Sahə | Seçim |
|---|---|
| Name | `portfel` |
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Ampere → VM.Standard.A1.Flex**, 2 OCPU, 12 GB RAM (pulsuz limit: cəmi 4 OCPU / 24 GB) |
| Networking | yeni VCN, **public subnet**, "Assign a public IPv4 address" — açıq |
| Add SSH keys | **Paste public keys** → `oracle_portfel.pub` məzmunu |
| Boot volume | default (47 GB) kifayətdir |

"Out of capacity" xətası çıxarsa: başqa Availability Domain seçin və ya bir neçə saatdan sonra yenidən cəhd edin.

Server yarandıqdan sonra **Public IP address**-i qeyd edin.

## 4. 80 və 443 portlarını açmaq

**Networking → Virtual cloud networks → (VCN) → Security Lists → Default Security List → Add Ingress Rules**

| Source CIDR | IP Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Serverin içindəki firewall-u quraşdırma skripti özü açır.)

## 5. Quraşdırma

**Variant A — Claude edir.** Public IP-ni Claude-a yazın. O, `~/.ssh/config`-ə `portfel-oracle` adlı qeyd əlavə
edib serverə qoşulacaq və skripti işə salacaq.

**Variant B — özünüz.** Kompüterdə:

```bash
ssh -i ~/.ssh/oracle_portfel ubuntu@<PUBLIC_IP>
```

Serverdə:

```bash
curl -fsSL https://raw.githubusercontent.com/BahmanOrujov/actuary.it.com/main/portfolio/deploy/setup_server.sh | sudo bash
```

Skript 10–20 dəqiqə çəkir və sonda ünvanı yazır: `https://<ip-tirelərlə>.sslip.io`.

## 6. İlk giriş

Ünvanı açın və **dərhal** qeydiyyatdan keçin: ilk hesab admin olur, ondan sonra qeydiyyat bağlanır
(`PA_OPEN_REGISTRATION=false`). Başqa birinin sizdən əvvəl qeydiyyatdan keçməməsi üçün bunu quraşdırma bitən
kimi edin.

## 7. Öz domeniniz (istəyə bağlı)

DNS-də (actuary.it.com Vercel-dədirsə: Vercel → Domains → actuary.it.com → DNS Records) `A` qeydi:
`app` → `<PUBLIC_IP>`. Sonra serverdə:

```bash
sudo bash /opt/actuary/portfolio/deploy/setup_server.sh app.actuary.it.com
```

## Gündəlik istifadə

- Yeniləmə (GitHub-a push edilmiş son versiya): `sudo bash /opt/actuary/portfolio/deploy/update.sh`
- Loqlar: `journalctl -u portfel-api -u portfel-worker@generate -u portfel-worker@validate -f`
- Baza: `/var/lib/portfel/app.db`; hər gecə 03:30-da `/var/lib/portfel/backups/` qovluğuna nüsxə (son 14).
- Konfiqurasiya və gizli açar: `/etc/portfel.env`.

## Bilmək lazım olanlar

- **Boş qalan pulsuz serverlər.** Oracle 7 gün ərzində CPU, şəbəkə və yaddaş istifadəsi çox aşağı olan Always
  Free serverlərini geri ala bilər. Hesabı "Pay As You Go"-ya keçirmək bunu aradan qaldırır və Always Free
  limitləri daxilində yenə də pulsuzdur (büdcə xəbərdarlığı qoymaq tövsiyə olunur).
- **Məlumat mənbəyi.** Server `personal` rejimində Yahoo məlumatı ilə işləyir: yalnız şəxsi istifadə üçündür.
  Başqalarına açıq xidmət üçün lisenziyalı provayder (`commercial` rejimi) lazımdır. Yahoo bulud IP-lərindən
  gələn sorğuları bəzən məhdudlaşdırır; belə halda platforma keşdən işləyir və xəbərdarlıq göstərir.
- **Ehtiyat nüsxə** eyni serverdədir. Vacib məlumat üçün vaxtaşırı kompüterə də köçürün:
  `scp -i ~/.ssh/oracle_portfel ubuntu@<IP>:/var/lib/portfel/backups/app-*.db .`
