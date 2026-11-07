import { de } from "./de.ts";
import { en } from "./en.ts";

export type MessageKey = keyof typeof de;
/** Every language has exactly the German keys (checked by the compiler) with the same placeholders (t.test.ts). */
export type Messages = Record<MessageKey, string>;

export type Lang = "de" | "en";
export const LANGS: readonly Lang[] = ["de", "en"];
/** Names of the languages in themselves, the same in every language. */
export const LANG_NAMES: Record<Lang, string> = { de: "Deutsch", en: "English" };

const MESSAGES: Record<Lang, Messages> = { de, en };
const DEFAULT_LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-US" };

let active: Lang = "de";
let activeLocale = DEFAULT_LOCALE.de;
let plural = new Intl.PluralRules(activeLocale);

export function isLang(value: unknown): value is Lang {
  return value === "de" || value === "en";
}

/**
 * Switches the language of all texts and formats. `locale` (e.g. "en-GB" from the browser) only refines the
 * formats of dates and numbers; it must belong to `lang`, otherwise the default locale of `lang` is used.
 */
export function setLanguage(lang: Lang, locale?: string) {
  active = lang;
  activeLocale = locale && primaryLanguage(locale) === lang && Intl.DateTimeFormat.supportedLocalesOf(locale).length ? locale : DEFAULT_LOCALE[lang];
  plural = new Intl.PluralRules(activeLocale);
}

export function language(): Lang {
  return active;
}

/** The locale for Intl formats, e.g. "de-DE". */
export function locale(): string {
  return activeLocale;
}

/** "en" for "en-GB", lower case. */
export function primaryLanguage(tag: string): string {
  return tag.split("-")[0]!.toLowerCase();
}

/** Looks up a UI text and replaces `{name}` placeholders with the given params. */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const template: string = MESSAGES[active][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * A text with a number in it: `<key>One` where the language's plural rules say "one" (and that key exists),
 * else `key`. The number is available as `{count}`; other params are passed on.
 */
export function tn(key: MessageKey, count: number, params?: Readonly<Record<string, string | number>>): string {
  const one = `${key}One`;
  const singular = plural.select(count) === "one" && Object.hasOwn(MESSAGES[active], one);
  return t(singular ? (one as MessageKey) : key, { count, ...params });
}

/** A value made from the locale (an Intl formatter), made again only after the language changed. */
export function perLocale<T>(make: (locale: string) => T): () => T {
  let madeFor: string | null = null;
  let value: T;
  return () => {
    if (madeFor !== activeLocale) {
      value = make(activeLocale);
      madeFor = activeLocale;
    }
    return value;
  };
}
