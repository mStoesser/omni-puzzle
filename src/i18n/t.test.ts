import { test } from "node:test";
import assert from "node:assert/strict";
import { de } from "./de.ts";
import { en } from "./en.ts";
import { language, locale, perLocale, setLanguage, t, tn } from "./t.ts";
import type { MessageKey } from "./t.ts";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("returns the plain text without params", () => {
  assert.equal(t("undo"), "Rückgängig");
});

test("replaces placeholders", () => {
  assert.equal(t("solvedMoves", { count: 7 }), "Du hast das Rätsel mit 7 Zügen gelöst.");
});

test("leaves unknown placeholders untouched", () => {
  assert.equal(t("solvedMoves", { other: 1 }), "Du hast das Rätsel mit {count} Zügen gelöst.");
});

test("both languages have the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const key of Object.keys(de) as MessageKey[]) {
    assert.deepEqual(placeholders(en[key]), placeholders(de[key]), key);
  }
});

test("every singular text belongs to a plural one and has no {count}", () => {
  for (const key of Object.keys(de) as MessageKey[]) {
    if (!/[a-z]One$/.test(key)) continue;
    const base = key.slice(0, -3);
    if (!(base in de)) continue; // e.g. quizMarkOne: "mark one"
    assert.ok(placeholders(de[base as MessageKey]).includes("count"), base);
    assert.ok(!placeholders(de[key]).includes("count"), key);
  }
});

test("only the legal note may be empty, and only in German", () => {
  for (const [key, text] of Object.entries(en)) assert.notEqual(text.trim(), "", key);
  for (const [key, text] of Object.entries(de)) if (key !== "legalTranslation") assert.notEqual(text.trim(), "", key);
});

test("switches the language of texts, plurals and formats", () => {
  try {
    setLanguage("en", "en-GB");
    assert.equal(language(), "en");
    assert.equal(locale(), "en-GB");
    assert.equal(t("undo"), "Undo");
    assert.equal(tn("galleryLikes", 1), "1 like");
    assert.equal(tn("galleryLikes", 0), "0 likes");
    assert.equal(tn("solvedMoves", 7), "You solved the puzzle in 7 moves.");
    setLanguage("en", "de-AT"); // a locale of another language is not used
    assert.equal(locale(), "en-US");
  } finally {
    setLanguage("de");
  }
  assert.equal(tn("galleryLikes", 1), "1 Like");
  assert.equal(tn("chainSteps", 3), "3 Rätsel");
  assert.equal(tn("galleryPlays", 2), "2 × gespielt");
});

test("perLocale makes the value again only after a change", () => {
  let made = 0;
  const format = perLocale((tag) => (made++, new Intl.NumberFormat(tag)));
  assert.equal(format().format(1.5), "1,5");
  format();
  assert.equal(made, 1);
  try {
    setLanguage("en");
    assert.equal(format().format(1.5), "1.5");
    assert.equal(made, 2);
  } finally {
    setLanguage("de");
  }
});
