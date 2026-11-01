"""English names of the stress scenarios and groups in config.yaml (the Azerbaijani names are the keys there).
A name missing here is shown as written in the config in both languages."""
from __future__ import annotations

from app.i18n import L

NAMES_EN = {
    "1929 krax": "1929 crash",
    "1973–74 neft böhranı": "1973–74 oil crisis",
    "1987 Qara Bazar ertəsi": "1987 Black Monday",
    "1990 Körfəz böhranı": "1990 Gulf crisis",
    "1997 Asiya böhranı": "1997 Asian crisis",
    "1998 Rusiya defoltu / LTCM": "1998 Russian default / LTCM",
    "Dot-com köpüyünün partlaması": "Dot-com bubble burst",
    "11 sentyabr 2001": "11 September 2001",
    "2002 mühasibat skandalları": "2002 accounting scandals",
    "2007–09 qlobal maliyyə böhranı": "2007–09 global financial crisis",
    "Lehman Brothers iflası": "Lehman Brothers collapse",
    "2008 Q4": "2008 Q4",
    "2010 Avro borc böhranı / flash crash": "2010 euro debt crisis / flash crash",
    "2011 ABŞ reytinqinin endirilməsi": "2011 US credit downgrade",
    "2013 taper tantrum": "2013 taper tantrum",
    "2015 Çin devalvasiyası": "2015 China devaluation",
    "2016 neft və Çin narahatlığı": "2016 oil and China worries",
    "Brexit referendumu": "Brexit referendum",
    "2018 fevral — volatillik şoku": "February 2018 — volatility shock",
    "2018 Q4 satışı": "2018 Q4 sell-off",
    "COVID 2020": "COVID 2020",
    "2020 sentyabr texnologiya satışı": "September 2020 tech sell-off",
    "2022 faiz şoku (ayı bazarı)": "2022 rate shock (bear market)",
    "2023 regional banklar (SVB)": "2023 regional banks (SVB)",
    "2023 yüksək faizlər": "2023 higher-for-longer rates",
    "2024 yen carry-trade çözülməsi": "2024 yen carry-trade unwind",
    "2025 aprel tarifləri": "April 2025 tariffs",
    "2009 bərpası": "2009 recovery",
    "2020 bərpası": "2020 recovery",
    "2025 tarif fasiləsi": "2025 tariff pause",
    "Bazar −10%": "Market −10%",
    "Bazar −20%": "Market −20%",
    "Bazar −30%": "Market −30%",
    "Bazar −40%": "Market −40%",
    "Bazar +10%": "Market +10%",
    "Bazar +20%": "Market +20%",
    "Faiz +50 bp": "Rates +50 bp",
    "Faiz +100 bp": "Rates +100 bp",
    "Faiz +200 bp": "Rates +200 bp",
    "Faiz −100 bp": "Rates −100 bp",
    "Neft −30%": "Oil −30%",
    "Neft −50%": "Oil −50%",
    "Neft +30%": "Oil +30%",
    "Neft +50%": "Oil +50%",
    "Dollar +10%": "Dollar +10%",
    "Dollar −10%": "Dollar −10%",
    "Qızıl +20%": "Gold +20%",
    "Qorxu indeksi (VIX) ikiqat": "Fear index (VIX) doubles",
    "Stagflyasiya": "Stagflation",
    "Resessiya": "Recession",
    "Maliyyə böhranı": "Financial crisis",
}

GROUPS_EN = {
    "böhran": "crisis", "krax": "crash", "geosiyasi": "geopolitical", "faiz": "rates", "sektor": "sector",
    "ralli": "rally", "bazar": "market", "əmtəə": "commodities", "valyuta": "currency", "makro": "macro",
}


def stress_name(name: str) -> str:
    return L(name, NAMES_EN.get(name, name))


def stress_group(group: str) -> str:
    return L(group, GROUPS_EN.get(group, group)) if group else ""
