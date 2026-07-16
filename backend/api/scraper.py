import os
import re
import html
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
import requests
from django.conf import settings
from django.utils import timezone
from api.models import BlogPost

# List of metadata for initial 13 blog posts
INITIAL_POSTS_METADATA = [
    {
        "id": 1, "icon": "📢", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 5,
        "title_en": "International Actuarial Association Releases Global AI Standards",
        "title_az": "Beynəlxalq Aktuar Assosiasiyası Qlobal Süni İntellekt Standartlarını Açıqladı",
        "excerpt_en": "First global standards released on GenAI adoption in actuarial reserving and pricing.",
        "excerpt_az": "Resurslar və hesabatlılıqda Generativ AI istifadəsinə dair ilk qlobal qaydalar dərc edildi.",
        "source_url": "https://www.actuaries.org/"
    },
    {
        "id": 2, "icon": "🇪🇺", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 7,
        "title_en": "Solvency II 2026 Reforms Enter Into Force",
        "title_az": "Solvency II 2026-cı il İslahatları Qüvvəyə Mindi",
        "excerpt_en": "Capital relief and tighter ESG disclosure mandates for European insurers and reinsurers.",
        "excerpt_az": "Avropa sığortaçıları üçün kapital azadlığı və daha sərt ESG hesabatlıq qaydaları.",
        "source_url": "https://www.eiopa.europa.eu/browse/regulation-and-policy/solvency-ii_en"
    },
    {
        "id": 3, "icon": "🏦", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 4,
        "title_en": "Central Bank Publishes New Actuarial Regulation Rules",
        "title_az": "Mərkəzi Bank Yeni Aktuar Tənzimləmə Qaydalarını Dərc Etdi",
        "excerpt_en": "Stricter IFRS 17 compliance and new exam certification guidelines approved for domestic actuaries.",
        "excerpt_az": "Milli sığorta bazarında IFRS 17 uyğunluğu və aktuarlar üçün yeni sertifikat tələbləri təsdiqləndi.",
        "source_url": "https://www.cbar.az/"
    },
    {
        "id": 4, "icon": "⛈️", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 6,
        "title_en": "Global Reinsurance Rates Peak in 2026",
        "title_az": "Qlobal Təkrarsığorta Bazarında Qiymətlər Rekord Həddə Çatdı",
        "excerpt_en": "Major reinsurers raise catastrophe cover rates by 15-20% following heavy climate losses.",
        "excerpt_az": "Təbii fəlakət itkilərindən sonra Swiss Re, Munich Re catastrophe cover haqlarını 15-20% artırıb.",
        "source_url": "https://www.swissre.com/"
    },
    {
        "id": 5, "icon": "🎓", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 5,
        "title_en": "SOA and CAS Make Python Modeling Mandatory in Exam Syllabus",
        "title_az": "SOA və CAS İmtahan Proqramlarında Python Modelləşdirməsini Məcburi Etdi",
        "excerpt_en": "Syllabus updates require actuarial candidates to build models in Python alongside traditional Excel.",
        "excerpt_az": "Yeni aktuar təhsili standartlarına əsasən namizədlərdən Python və maşın öyrənməsi bilikləri tələb olunacaq.",
        "source_url": "https://www.soa.org/"
    },
    {
        "id": 6, "icon": "🇬🇧", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 6,
        "title_en": "UK Actuarial Institute Publishes CMI_2025 Mortality Table",
        "title_az": "İngiltərə Aktuarlar İnstitutu Yeni CMI_2025 Ölüm Cədvəllərini Dərc Etdi",
        "excerpt_en": "New mortality model shows stable life expectancy recovery, shifting reserving expectations.",
        "excerpt_az": "Pandemiyadan sonrakı ölüm dinamikasına əsasən proqnozlar yeniləndi; pensiya ehtiyatlarına təsiri gözlənilir.",
        "source_url": "https://www.actuaries.org.uk/"
    },
    {
        "id": 7, "icon": "🛡️", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 6,
        "title_en": "Global Cyber Insurance Market Reaches Record $20 Billion",
        "title_az": "Qlobal Kiber Sığorta Bazarı Rekord 20 Milyard Dollara Çatdı",
        "excerpt_en": "Munich Re report indicates a surge in demand for cyber policies driven by AI-backed ransomware.",
        "excerpt_az": "Munich Re-nin hesabatına görə kiber hücumların artması kiber təminatlara tələbi sürətlə çoxaldır.",
        "source_url": "https://www.munichre.com/"
    },
    {
        "id": 8, "icon": "🌾", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 5,
        "title_en": "Parametric Insurance Surges 40% in UN Agricultural Projects",
        "title_az": "BMT Aqrar Layihələrində Parametrik Sığorta 40% Artıb",
        "excerpt_en": "UN report highlights automated index-linked payouts safeguarding smallholder crops from drought.",
        "excerpt_az": "İqlim dəyişikliyinə qarşı sürətli tetikleyici indeksli ödənişlər fermerləri qoruyur.",
        "source_url": "https://www.unepfi.org/"
    },
    {
        "id": 9, "icon": "🇦🇿", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 4,
        "title_en": "Baku to Host Annual Global Forum of Actuaries",
        "title_az": "Bakı Şəhəri Aktuarların İllik Qlobal Forumuna Ev Sahibliyi Edəcək",
        "excerpt_en": "Baku announced as the location for the major international actuarial summit in October 2026.",
        "excerpt_az": "Oktyabr 2026-da Bakıda keçiriləcək sammitdə sığortada rəqəmsallaşma və ESG riskləri müzakirə olunacaq.",
        "source_url": "https://www.actuaries.org/"
    },
    {
        "id": 10, "icon": "🪙", "date_en": "03 July 2026", "date_az": "03 İyul 2026", "read_time": 6,
        "title_en": "New Dynamic Inflation Strategies Introduced in Asset-Liability Management",
        "title_az": "Aktiv-Öhdəlik İdarəetməsində Yeni Dinamik İnflyasiya Həlləri Təqdim Edildi",
        "excerpt_en": "Backtesting shows dynamic ALM adjustments mitigate pension deficit growth by 25%.",
        "excerpt_az": "Pensiya fondları üçün dinamik hedging metodları inflyasiyanın gətirdiyi kəsiri 25% azaldır.",
        "source_url": "https://www.oecd.org/"
    },
    {
        "id": 11, "icon": "🇪🇺", "date_en": "15 July 2026", "date_az": "15 İyul 2026", "read_time": 6,
        "title_en": "EIOPA Publishes Final Guidelines for Solvency II Review",
        "title_az": "EIOPA Solvency II İslahatı üzrə Yekun Təlimatları Dərc Etdi",
        "excerpt_en": "The European Insurance and Occupational Pensions Authority (EIOPA) has finalized technical standards on liquidity risk and technical provisions.",
        "excerpt_az": "Avropa Sığorta və Peşəkar Pensiya Təminatı Qurumu (EIOPA) likvidlik riski və texniki ehtiyatların qiymətləndirilməsi üzrə yeni standartları təsdiqlədi.",
        "source_url": "https://www.eiopa.europa.eu/"
    },
    {
        "id": 12, "icon": "📈", "date_en": "24 June 2026", "date_az": "24 İyun 2026", "read_time": 5,
        "title_en": "EIOPA Releases Financial Stability Report Amid Global Macroeconomic Uncertainty",
        "title_az": "EIOPA Qlobal Makroiqtisadi Qeyri-müəyyənlik Fonunda Maliyyə Sabitliyi Hesabatını Açıqladı",
        "excerpt_en": "The June 2026 report assesses the resilience of European insurance and pension sectors against climate change and geopolitical headwinds.",
        "excerpt_az": "2026-cı ilin iyun hesabatı Avropa sığorta və pensiya sektorlarının iqlim dəyişikliyi və geopolitik risklər qarşısında dözümlülüyünü təhlil edir.",
        "source_url": "https://www.eiopa.europa.eu/financial-stability-report_en"
    },
    {
        "id": 13, "icon": "⚖️", "date_en": "08 July 2026", "date_az": "08 İyul 2026", "read_time": 5,
        "title_en": "New Consultation Launched on Insurance Recovery and Resolution Directive (IRRD)",
        "title_az": "Sığortanın Sağlamlaşdırılması və Struktur Dəyişikliyi (IRRD) üzrə Yeni Məsləhətləşmələr Başladı",
        "excerpt_en": "EIOPA has initiated a public consultation on the technical standards for valuation under the new IRRD framework.",
        "excerpt_az": "EIOPA sığorta şirkətlərinin bərpası və maliyyə sağlamlaşdırılması standartlarının qiymətləndirilməsinə dair ictimai rəy sorğusuna start verdi.",
        "source_url": "https://www.eiopa.europa.eu/"
    }
]

def translate_text(text, target_lang="az"):
    if not text:
        return ""
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    
    # Split text into chunks of maximum 800 characters to prevent URL length limits
    chunks = []
    current_chunk = ""
    for sentence in text.split(". "):
        if len(current_chunk) + len(sentence) < 800:
            current_chunk += sentence + ". "
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence + ". "
    if current_chunk:
        chunks.append(current_chunk.strip())
        
    translated_chunks = []
    for chunk in chunks:
        try:
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q={urllib.parse.quote(chunk)}"
            res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
            if res.status_code == 200:
                parts = res.json()
                translated_sentence = "".join([part[0] for part in parts[0] if part and part[0]])
                translated_chunks.append(translated_sentence)
            else:
                translated_chunks.append(chunk)
        except Exception as e:
            print(f"Translation chunk error: {e}", flush=True)
            translated_chunks.append(chunk)
            
    return " ".join(translated_chunks).strip()

def populate_initial_posts():
    """Reads existing static blog files and inserts them into the DB if empty."""
    if BlogPost.objects.count() > 0:
        return
        
    print("Populating initial 13 blog posts...", flush=True)
    blog_dir = settings.BASE_DIR.parent / "frontend" / "blog"
    
    for metadata in INITIAL_POSTS_METADATA:
        idx = metadata["id"]
        
        # Read content files if they exist, fallback to excerpt if not found
        content_en = metadata["excerpt_en"]
        content_az = metadata["excerpt_az"]
        
        file_en = blog_dir / f"blog_{idx}_en.txt"
        file_az = blog_dir / f"blog_{idx}_az.txt"
        
        if file_en.exists():
            try:
                with open(file_en, "r", encoding="utf-8") as f:
                    content_en = f.read().strip()
            except Exception as e:
                print(f"Error reading {file_en}: {e}", flush=True)
                
        if file_az.exists():
            try:
                with open(file_az, "r", encoding="utf-8") as f:
                    content_az = f.read().strip()
            except Exception as e:
                print(f"Error reading {file_az}: {e}", flush=True)
                
        BlogPost.objects.create(
            title_en=metadata["title_en"],
            title_az=metadata["title_az"],
            excerpt_en=metadata["excerpt_en"],
            excerpt_az=metadata["excerpt_az"],
            content_en=content_en,
            content_az=content_az,
            date_en=metadata["date_en"],
            date_az=metadata["date_az"],
            read_time=metadata["read_time"],
            source_url=metadata["source_url"],
            icon=metadata["icon"]
        )
    print("Initial blog posts populated successfully!", flush=True)

def scrape_actuarial_news():
    """Scrapes RSS feeds from SOA and EIOPA, auto-translates, and saves new posts."""
    populate_initial_posts()
    
    print("Starting daily actuarial news scrape...", flush=True)
    feeds = [
        {"url": "https://theactuarymagazine.org/feed/", "icon": "📢"}
    ]
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
    
    new_posts_count = 0
    
    for feed in feeds:
        try:
            response = requests.get(feed["url"], headers=headers, timeout=10)
            if response.status_code != 200:
                print(f"Failed to fetch feed {feed['url']}: HTTP {response.status_code}", flush=True)
                continue
                
            root = ET.fromstring(response.content)
            items = root.findall(".//item")
            
            # Scrape up to 3 latest items from each feed to prevent bloating
            for item in items[:3]:
                title = item.find("title")
                link = item.find("link")
                description = item.find("description")
                pub_date = item.find("pubDate")
                
                title_text = title.text.strip() if title is not None else ""
                link_text = link.text.strip() if link is not None else ""
                desc_text = description.text.strip() if description is not None else ""
                
                if not title_text or not link_text:
                    continue
                    
                # Clean html tags from description to use as excerpt and body
                desc_clean = re.sub(r'<[^>]+>', '', desc_text)
                desc_clean = html.unescape(desc_clean).strip()
                
                # Check if post already exists in database
                if BlogPost.objects.filter(source_url=link_text).exists():
                    continue
                    
                # Format dates
                dt_en = "Recent News"
                dt_az = "Son Xəbərlər"
                if pub_date is not None and pub_date.text:
                    try:
                        # e.g., Wed, 15 Jul 2026 12:00:00 GMT
                        parsed_dt = datetime.strptime(pub_date.text.split(" +")[0].split(" -")[0].strip()[:25], "%a, %d %b %Y %H:%M:%S")
                        dt_en = parsed_dt.strftime("%d %B %Y")
                        # Translate month names to AZ
                        months_map = {
                            "January": "Yanvar", "February": "Fevral", "March": "Mart", "April": "Aprel",
                            "May": "May", "June": "İyun", "July": "İyul", "August": "Avqust",
                            "September": "Sentyabr", "October": "Oktyabr", "November": "Noyabr", "December": "Dekabr"
                        }
                        month_name = parsed_dt.strftime("%B")
                        month_az = months_map.get(month_name, month_name)
                        dt_az = parsed_dt.strftime(f"%d {month_az} %Y")
                    except Exception as date_err:
                        print(f"Date parsing error: {date_err}", flush=True)
                
                print(f"New article found: {title_text}. Translating...", flush=True)
                
                # Translate title and description to Azerbaijani
                title_az = translate_text(title_text, "az")
                desc_az = translate_text(desc_clean, "az")
                
                # Create the BlogPost
                BlogPost.objects.create(
                    title_en=title_text,
                    title_az=title_az,
                    excerpt_en=desc_clean[:200] + "..." if len(desc_clean) > 200 else desc_clean,
                    excerpt_az=desc_az[:200] + "..." if len(desc_az) > 200 else desc_az,
                    content_en=desc_clean,
                    content_az=desc_az,
                    date_en=dt_en,
                    date_az=dt_az,
                    read_time=max(3, len(desc_clean.split()) // 150),
                    source_url=link_text,
                    icon=feed["icon"]
                )
                new_posts_count += 1
                
        except Exception as e:
            print(f"Error scraping feed {feed['url']}: {e}", flush=True)
            
    print(f"Scraper run finished. Added {new_posts_count} new blog posts.", flush=True)
