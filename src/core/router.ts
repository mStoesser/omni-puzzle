import { formatGalleryFilter, parseGalleryFilter } from "./gallery.ts";
import type { GalleryFilter } from "./gallery.ts";
import { formatLibraryFilter, parseLibraryFilter } from "./library-status.ts";
import type { LibraryFilter } from "./library-status.ts";

export type Route =
  | { name: "home" }
  | { name: "gallery"; filter: GalleryFilter }
  | { name: "library"; filter: LibraryFilter } // M35: status filter
  | { name: "imprint" }
  | { name: "privacy" }
  | { name: "account" }
  | { name: "moderation" }
  | { name: "daily" } // the puzzle of the day (M26), whichever it is today
  | { name: "shared"; code: string }
  | { name: "new"; type: string }
  | { name: "edit"; id: string }
  | { name: "play"; id: string }
  | { name: "published"; id: string }
  | { name: "chain"; id: string; step: number | null } // step: 1-based, null = overview
  | { name: "chainNew" }
  | { name: "room"; id: string } // an escape room (M44): built-in example or own (M45)
  | { name: "roomEdit"; id: string } // the escape room editor (M45)
  | { name: "publishedRoom"; id: string } // a published escape room (M46)
  | { name: "sharedRoom"; code: string }; // an escape room in a share link (M46), like "shared" for puzzles

const TYPE_ID = /^[a-z0-9-]{1,32}$/;
const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHARE_CODE = /^[A-Za-z0-9._-]+$/;
const PUBLISHED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const HOME: Route = { name: "home" };

/** Parses a location hash like "#/play/abc". Anything unknown maps to home. */
export function parseRoute(hash: string): Route {
  const [path = "", search = ""] = hash.replace(/^#\/?/, "").split("?", 2);
  if (path === "") return HOME;
  // Only the gallery and the library have a query part: their filters.
  if (path === "gallery") return { name: "gallery", filter: parseGalleryFilter(search) };
  if (path === "library") return { name: "library", filter: parseLibraryFilter(search) };
  if (search !== "") return HOME;
  const [head, arg, ...rest] = path.split("/");
  if (head === "c" && arg !== undefined && PUBLISHED_ID.test(arg) && rest.length <= 1) {
    if (rest.length === 0) return { name: "chain", id: arg, step: null };
    const step = Number(rest[0]);
    return /^[1-9][0-9]?$/.test(rest[0]!) ? { name: "chain", id: arg, step } : HOME;
  }
  if (rest.length > 0) return HOME;

  if (arg === undefined) {
    if (head === "impressum") return { name: "imprint" };
    if (head === "datenschutz") return { name: "privacy" };
    if (head === "account") return { name: "account" };
    if (head === "moderation") return { name: "moderation" };
    if (head === "daily") return { name: "daily" };
    return HOME;
  }
  switch (head) {
    case "p":
      return SHARE_CODE.test(arg) ? { name: "shared", code: arg } : HOME;
    case "new":
      return TYPE_ID.test(arg) ? { name: "new", type: arg } : HOME;
    case "edit":
      return LOCAL_ID.test(arg) ? { name: "edit", id: arg } : HOME;
    case "play":
      return LOCAL_ID.test(arg) ? { name: "play", id: arg } : HOME;
    case "g":
      return PUBLISHED_ID.test(arg) ? { name: "published", id: arg } : HOME;
    case "chain":
      return arg === "new" ? { name: "chainNew" } : HOME;
    case "room":
      return LOCAL_ID.test(arg) ? { name: "room", id: arg } : HOME;
    case "room-edit":
      return LOCAL_ID.test(arg) ? { name: "roomEdit", id: arg } : HOME;
    case "r":
      return PUBLISHED_ID.test(arg) ? { name: "publishedRoom", id: arg } : HOME;
    case "e":
      return SHARE_CODE.test(arg) ? { name: "sharedRoom", code: arg } : HOME;
    default:
      return HOME;
  }
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "gallery": {
      const search = formatGalleryFilter(route.filter);
      return search ? `#/gallery?${search}` : "#/gallery";
    }
    case "library": {
      const search = formatLibraryFilter(route.filter);
      return search ? `#/library?${search}` : "#/library";
    }
    case "imprint":
      return "#/impressum";
    case "privacy":
      return "#/datenschutz";
    case "account":
      return "#/account";
    case "moderation":
      return "#/moderation";
    case "daily":
      return "#/daily";
    case "shared":
      return `#/p/${route.code}`;
    case "new":
      return `#/new/${route.type}`;
    case "edit":
      return `#/edit/${route.id}`;
    case "play":
      return `#/play/${route.id}`;
    case "published":
      return `#/g/${route.id}`;
    case "chain":
      return route.step === null ? `#/c/${route.id}` : `#/c/${route.id}/${route.step}`;
    case "chainNew":
      return "#/chain/new";
    case "room":
      return `#/room/${route.id}`;
    case "roomEdit":
      return `#/room-edit/${route.id}`;
    case "publishedRoom":
      return `#/r/${route.id}`;
    case "sharedRoom":
      return `#/e/${route.code}`;
  }
}

// --- Modes (M41) ---

/**
 * How a puzzle route is presented; it travels in the link as `?mode=…`. "full" = full screen (M41), "escape" = full
 * screen without a way back that shows the puzzle's result when solved (M42).
 */
export type Mode = "full" | "escape";
const MODES: readonly string[] = ["full", "escape"] satisfies readonly Mode[];

/** A route with its mode. null = the normal view. */
export type Address = { route: Route; mode: Mode | null };

/**
 * The mode new share links get (share sheet, QR code, link after publishing): escape mode for a puzzle with a result
 * (M42), full screen otherwise.
 */
export function linkMode(hasResult: boolean): Mode {
  return hasResult ? "escape" : "full";
}

/** Routes that play a puzzle may carry a mode; for a chain it applies to its steps (the overview stays normal). */
export function takesMode(route: Route): boolean {
  return route.name === "play" || route.name === "shared" || route.name === "published" || route.name === "chain" || route.name === "daily";
}

/** Whether `route` can be shown in `mode`: escape mode not for chains yet (they come with the escape room). */
export function modeFits(route: Route, mode: Mode): boolean {
  return takesMode(route) && !(mode === "escape" && route.name === "chain");
}

/**
 * Parses a hash with an optional mode. Only `mode=<word>` is allowed as query part of a puzzle route; an unknown
 * mode, or one the route cannot show (escape mode for a chain), means the normal view, so a newer app's link still opens. Everything else behaves like `parseRoute`.
 */
export function parseAddress(hash: string): Address {
  const rest = hash.replace(/^#\/?/, "");
  const query = rest.indexOf("?");
  const mode = query < 0 ? null : /^mode=([a-z]{1,16})$/.exec(rest.slice(query + 1));
  if (mode) {
    const route = parseRoute(`#/${rest.slice(0, query)}`);
    if (takesMode(route)) {
      const known = MODES.includes(mode[1]!) ? (mode[1] as Mode) : null;
      return { route, mode: known && modeFits(route, known) ? known : null };
    }
  }
  return { route: parseRoute(hash), mode: null };
}

export function formatAddress(route: Route, mode: Mode | null): string {
  return mode !== null && modeFits(route, mode) ? `${formatRoute(route)}?mode=${mode}` : formatRoute(route);
}

/** The same route as `href` with another mode, e.g. the next level in full screen. */
export function hrefWithMode(href: string, mode: Mode | null): string {
  return formatAddress(parseAddress(href).route, mode);
}

/** Calls `onRoute` now and on every hash change. Unknown hashes are replaced by "#/". */
export function startRouter(onRoute: (address: Address) => void): () => void {
  const handle = () => {
    const address = parseAddress(location.hash);
    if (address.route.name === "home" && !["", "#", "#/"].includes(location.hash)) {
      history.replaceState(null, "", formatRoute(address.route));
    }
    onRoute(address);
  };
  window.addEventListener("hashchange", handle);
  handle();
  return () => window.removeEventListener("hashchange", handle);
}
