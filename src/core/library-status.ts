// Status of own puzzles in the library (M35). Pure.
//
// A status holds only while the puzzle's content is the one that was published or shared: both are compared by the
// content key (progressKey of the checked document). Title, description and theme are not part of it, so changing
// them keeps the status; changing the puzzle itself makes it a draft again.
// - "In der Galerie": the content keys of the user's own visible published puzzles, loaded from the server. So it works
//   on every device of the account, without syncing a status.
// - "Per Link geteilt": content keys whose link was copied or sent on this device, kept in IndexedDB (meta store).

export type LibraryStatus = "gallery" | "link" | "ready" | "draft";
export type LibraryFilter = "all" | "drafts" | "shared";
export const LIBRARY_FILTERS: readonly LibraryFilter[] = ["all", "drafts", "shared"];

/** IndexedDB meta key of the shared content keys. */
export const SHARED_KEYS_KEY = "shared-keys";
/** Newest first; older ones drop out. A shared link of long ago is not worth a badge forever. */
export const MAX_SHARED_KEYS = 500;

const KEY = /^[0-9a-f]{64}$/;

/**
 * `contentKey` null: the draft cannot be checked (problems), so it was neither shared nor published in this form.
 * `verified`: solved by the creator, ready to share.
 */
export function libraryStatus(
  contentKey: string | null,
  verified: boolean,
  known: { published: ReadonlySet<string> | null; shared: ReadonlySet<string> },
): LibraryStatus {
  if (contentKey !== null && known.published?.has(contentKey)) return "gallery";
  if (contentKey !== null && known.shared.has(contentKey)) return "link";
  return verified ? "ready" : "draft";
}

/** "Entwürfe" are all puzzles that are neither in the gallery nor shared by link, ready or not. */
export function matchesFilter(status: LibraryStatus, filter: LibraryFilter): boolean {
  if (filter === "all") return true;
  const shared = status === "gallery" || status === "link";
  return filter === "shared" ? shared : !shared;
}

/** Local title search in the library (M37): every word must occur in the title, ignoring case. Empty matches all. */
export function matchesTitle(title: string, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = title.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The query part of the library route ("filter=drafts"); anything else is "all". */
export function parseLibraryFilter(search: string): LibraryFilter {
  const value = new URLSearchParams(search).get("filter");
  return value === "drafts" || value === "shared" ? value : "all";
}

export function formatLibraryFilter(filter: LibraryFilter): string {
  return filter === "all" ? "" : `filter=${filter}`;
}

/** Stored shared keys; anything malformed is dropped. */
export function parseSharedKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((key): key is string => typeof key === "string" && KEY.test(key)))].slice(0, MAX_SHARED_KEYS);
}

/** Adds a key in front (or moves it there). Returns the same list if it is already the newest. */
export function addSharedKey(keys: readonly string[], key: string): readonly string[] {
  if (!KEY.test(key) || keys[0] === key) return keys;
  return [key, ...keys.filter((k) => k !== key)].slice(0, MAX_SHARED_KEYS);
}
