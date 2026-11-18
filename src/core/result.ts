// M42: the result a puzzle shows when solved in escape mode (meta.result), chosen by its creator: a code, a text or a
// link. The kind is derived from the text, so the creator only fills in one field.

/** Longest result, in characters (after trimming). */
export const RESULT_MAX = 500;
/** Up to this length and without spaces, a result is shown large, like a code (e.g. "4711", "ROT-7"). */
export const CODE_MAX = 12;

export type PuzzleResult =
  | { kind: "code"; text: string }
  | { kind: "text"; text: string }
  | { kind: "link"; url: string; domain: string };

/**
 * How a result is shown; null = none. Only a whole field that is one `https://` address becomes a link; addresses
 * inside a text and other schemes (`http://`, `javascript:` …) stay plain text. The domain comes from `URL.hostname`,
 * so letters that only look alike show as punycode (`xn--…`).
 */
export function parseResult(raw: string | undefined): PuzzleResult | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  if (!/\s/.test(text)) {
    const link = httpsLink(text);
    if (link) return link;
    if ([...text].length <= CODE_MAX) return { kind: "code", text };
  }
  return { kind: "text", text };
}

function httpsLink(text: string): PuzzleResult | null {
  if (!/^https:\/\//i.test(text) || !URL.canParse(text)) return null;
  const url = new URL(text);
  if (url.protocol !== "https:" || url.hostname === "" || url.username !== "" || url.password !== "") return null;
  return { kind: "link", url: url.href, domain: url.hostname };
}
