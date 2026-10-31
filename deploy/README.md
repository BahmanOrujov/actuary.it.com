# actuary.it.com-u öz serverində işlətmək

Bir Ubuntu serverində (Oracle Cloud Always Free) bütün sayt:

| Ünvan | Nə işləyir |
|---|---|
| `https://www.actuary.it.com` | statik sayt (`frontend/`), `/api` və `/admin` → Django (`backend/`, gunicorn) |
| `https://actuary.it.com` | `www`-yə yönləndirmə |
| `https://www.actuary.it.com/portfolio/` | Portfel Analizinin tam versiyası (`portfolio/`); demo `/portfolio/demo/` |

DNS dəyişənə qədər eyni server test ünvanında cavab verir: `https://<ip-tirelərlə>.sslip.io` (portfel:
`/portfolio/`). Vercel və Render bu müddətdə olduğu kimi işləməyə davam edir.

## 1. Server

Oracle hesabı, server (Ubuntu 24.04, VM.Standard.A1.Flex) və 80/443 portları:
[portfolio/docs/deploy_oracle.md](../portfolio/docs/deploy_oracle.md), 1–4-cü addımlar.

## 2. Quraşdırma

```bash
curl -fsSL https://raw.githubusercontent.com/BahmanOrujov/actuary.it.com/main/deploy/setup_server.sh | sudo bash
```

## 3. DNS keçidi (GoDaddy)

Domenin DNS-i GoDaddy-dədir (`ns13/ns14.domaincontrol.com`). **My Products → actuary.it.com → DNS**:

| Növ | Ad | Dəyər | Qeyd |
|---|---|---|---|
| A | `@` | serverin IP-si | Vercel-in köhnə A qeydini (`216.198.79.1`) bununla əvəz edin |
| A (və ya CNAME → `@`) | `www` | serverin IP-si | Vercel-ə gedən köhnə `www` qeydini silin/əvəz edin |

DNS yayılandan sonra (adətən 5–60 dəqiqə) skripti yenidən işə salın — real ünvanları Caddy-yə əlavə edib
sertifikat alır:

```bash
sudo bash /opt/actuary/deploy/setup_server.sh
```

Sonra Vercel layihəsindən domeni çıxarmaq və Render servisini dayandırmaq olar.

## 4. Feedback e-poçtları

Render-dəki `EMAIL_HOST_USER` və `EMAIL_HOST_PASSWORD` dəyərlərini serverdə özünüz yazın (Gmail üçün "app
password"):

```bash
sudo nano /etc/actuary-site.env
sudo systemctl restart actuary-site
```

## Gündəlik

- Yeniləmə: `sudo bash /opt/actuary/deploy/update.sh`
- Loqlar: `journalctl -u actuary-site -u portfel-api -u portfel-worker@generate -u portfel-worker@validate -f`
- Caddy: `/etc/caddy/Caddyfile`, `journalctl -u caddy -f`
