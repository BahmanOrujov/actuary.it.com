import { LANG, setLang } from "../lang";

/** AZ | EN toggle; switching reloads the page so every text, including server-made ones, follows. */
export default function LangSwitch() {
  return (
    <div className="lang-switch" role="group" aria-label="Dil / Language">
      <button className={LANG === "az" ? "on" : ""} aria-pressed={LANG === "az"} onClick={() => LANG !== "az" && setLang("az")}>AZ</button>
      <button className={LANG === "en" ? "on" : ""} aria-pressed={LANG === "en"} onClick={() => LANG !== "en" && setLang("en")}>EN</button>
    </div>
  );
}
