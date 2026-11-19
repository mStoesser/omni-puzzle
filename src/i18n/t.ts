// The texts of a language are a chunk of their own (loaded with `import()`), so the app only downloads the language
// it shows. The German texts define the keys; only their type is imported here.
import type { de } from "./de.ts";

export type MessageKey = keyof typeof de;
/** Every language has exactly the German keys (checked by the compiler) with the same placeholders (t.test.ts). */
export type Messages = Record<MessageKey, string>;

export type Lang = "de" | "en";
export const LANGS: readonly Lang[] = ["de", "en"];
/** Names of the languages in themselves, the same in every language. */
export const LANG_NAMES: Record<Lang, string> = { de: "Deutsch", en: "English" };

const LOADERS: Record<Lang, () => Promise<Messages>> = {
  de: () => import("./de.ts").then((m) => m.de),
  en: () => import("./en.ts").then((m) => m.en),
};
const MESSAGES: Partial<Record<Lang, Messages>> = {};
const DEFAULT_LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-US" };

let active: Lang = "de";
let activeLocale = DEFAULT_LOCALE.de;
let plural = new Intl.PluralRules(activeLocale);

export function isLang(value: unknown): value is Lang {
  return value === "de" || value === "en";
}

/** Loads the texts of a language (once); rejects when they cannot be fetched (e.g. offline and not cached yet). */
export async function loadMessages(lang: Lang): Promise<void> {
  MESSAGES[lang] ??= await LOADERS[lang]();
}

/** The texts of a language without loading them, e.g. in tests. */
export function provideMessages(lang: Lang, messages: Messages): void {
  MESSAGES[lang] = messages;
}

export function hasMessages(lang: Lang): boolean {
  return MESSAGES[lang] !== undefined;
}

/**
 * Switches the language of all texts and formats. `locale` (e.g. "en-GB" from the browser) only refines the
 * formats of dates and numbers; it must belong to `lang`, otherwise the default locale of `lang` is used.
 * The texts of `lang` must be loaded (`loadMessages`).
 */
export function setLanguage(lang: Lang, locale?: string) {
  if (!MESSAGES[lang]) throw new Error(`texts of ${lang} are not loaded`);
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
  const template: string = MESSAGES[active]?.[key] ?? key; // only before the start, see main.ts
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
  const singular = plural.select(count) === "one" && Object.hasOwn(MESSAGES[active] ?? {}, one);
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
