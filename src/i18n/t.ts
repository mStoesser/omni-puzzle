import { de } from "./de.ts";

export type MessageKey = keyof typeof de;

/** Looks up a UI text and replaces `{name}` placeholders with the given params. */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const template: string = de[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}
