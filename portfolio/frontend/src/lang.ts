// Interface language. Azerbaijani is the default; the choice is kept in the browser and sent to the API (x-lang)
// so server-made texts (errors, briefings, recommendations, the PDF) follow it.

export type Lang = "az" | "en";

function initial(): Lang {
  try {
    const saved = localStorage.getItem("pa_lang");
    if (saved === "az" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  return "az";
}

export const LANG: Lang = initial();
document.documentElement.lang = LANG;

/** The text in the current language: L("Yadda saxla", "Save"). */
export const L = (az: string, en: string): string => (LANG === "en" ? en : az);

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem("pa_lang", lang);
  } catch {
    /* storage unavailable: the switch lasts until reload */
  }
  window.location.reload();
}
