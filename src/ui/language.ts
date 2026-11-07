// Language choice (M28): "system" (default) follows the browser's languages, "de"/"en" are fixed.
// Stored per device in localStorage, like the theme. Applying it switches all texts and formats (i18n/t.ts).
import { isLang, primaryLanguage, setLanguage, t } from "../i18n/t.ts";
import type { Lang } from "../i18n/t.ts";

export type LanguageChoice = Lang | "system";

export const LANGUAGE_KEY = "knobelkiste-lang";
/** Used when none of the browser's languages is one the app has. */
const FALLBACK: Lang = "en";

export function parseLanguageChoice(value: string | null): LanguageChoice {
  return isLang(value) ? value : "system";
}

export function readLanguageChoice(): LanguageChoice {
  try {
    return parseLanguageChoice(localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return "system";
  }
}

/**
 * The language for a choice, and the browser's own locale of that language (e.g. "en-GB") for formats.
 * "system" takes the first of the preferred languages the app has.
 */
export function resolveLanguage(choice: LanguageChoice, preferred: readonly string[]): { lang: Lang; locale?: string } {
  const lang = choice !== "system" ? choice : (preferred.map(primaryLanguage).find(isLang) ?? FALLBACK);
  const locale = preferred.find((tag) => primaryLanguage(tag) === lang && tag.includes("-"));
  return locale ? { lang, locale } : { lang };
}

function browserLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** Switches texts and formats; `<html lang>` and the page description follow. Returns the language. */
export function applyLanguage(choice: LanguageChoice): Lang {
  const { lang, locale } = resolveLanguage(choice, browserLanguages());
  setLanguage(lang, locale);
  document.documentElement.lang = lang;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("appDescription"));
  return lang;
}

export function storeLanguageChoice(choice: LanguageChoice) {
  try {
    if (choice === "system") localStorage.removeItem(LANGUAGE_KEY);
    else localStorage.setItem(LANGUAGE_KEY, choice);
  } catch {
    // not stored; applies to this visit only
  }
}

/** Calls `onChange` when the browser's languages change while "system" is chosen. */
export function watchSystemLanguage(onChange: () => void) {
  addEventListener("languagechange", () => {
    if (readLanguageChoice() === "system") onChange();
  });
}
