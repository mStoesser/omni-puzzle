import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLanguageChoice, resolveLanguage } from "./language.ts";

test("unknown stored values mean the browser's language", () => {
  assert.equal(parseLanguageChoice(null), "system");
  assert.equal(parseLanguageChoice("fr"), "system");
  assert.equal(parseLanguageChoice("en"), "en");
});

test("system takes the first language the app has, else English", () => {
  assert.deepEqual(resolveLanguage("system", ["fr-FR", "de-AT", "en-GB"]), { lang: "de", locale: "de-AT" });
  assert.deepEqual(resolveLanguage("system", ["EN-gb", "de"]), { lang: "en", locale: "EN-gb" });
  assert.deepEqual(resolveLanguage("system", ["de"]), { lang: "de" });
  assert.deepEqual(resolveLanguage("system", ["fr-FR", "it"]), { lang: "en" });
  assert.deepEqual(resolveLanguage("system", []), { lang: "en" });
});

test("a fixed choice keeps the browser's locale of that language for formats", () => {
  assert.deepEqual(resolveLanguage("en", ["de-DE", "en-AU"]), { lang: "en", locale: "en-AU" });
  assert.deepEqual(resolveLanguage("de", ["en-US"]), { lang: "de" });
});
