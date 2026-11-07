import { formatGalleryFilter, parseGalleryFilter } from "./gallery.ts";
import type { GalleryFilter } from "./gallery.ts";

export type Route =
  | { name: "home" }
  | { name: "gallery"; filter: GalleryFilter }
  | { name: "library" }
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
  | { name: "chainNew" };

const TYPE_ID = /^[a-z0-9-]{1,32}$/;
const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHARE_CODE = /^[A-Za-z0-9._-]+$/;
const PUBLISHED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const HOME: Route = { name: "home" };

/** Parses a location hash like "#/play/abc". Anything unknown maps to home. */
export function parseRoute(hash: string): Route {
  const [path = "", search = ""] = hash.replace(/^#\/?/, "").split("?", 2);
  if (path === "") return HOME;
  // Only the gallery has a query part: its filters.
  if (path === "gallery") return { name: "gallery", filter: parseGalleryFilter(search) };
  if (search !== "") return HOME;
  const [head, arg, ...rest] = path.split("/");
  if (head === "c" && arg !== undefined && PUBLISHED_ID.test(arg) && rest.length <= 1) {
    if (rest.length === 0) return { name: "chain", id: arg, step: null };
    const step = Number(rest[0]);
    return /^[1-9][0-9]?$/.test(rest[0]!) ? { name: "chain", id: arg, step } : HOME;
  }
  if (rest.length > 0) return HOME;

  if (arg === undefined) {
    if (head === "library") return { name: "library" };
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
    case "library":
      return "#/library";
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
  }
}

/** Calls `onRoute` now and on every hash change. Unknown hashes are replaced by "#/". */
export function startRouter(onRoute: (route: Route) => void): () => void {
  const handle = () => {
    const route = parseRoute(location.hash);
    if (route.name === "home" && !["", "#", "#/"].includes(location.hash)) {
      history.replaceState(null, "", formatRoute(route));
    }
    onRoute(route);
  };
  window.addEventListener("hashchange", handle);
  handle();
  return () => window.removeEventListener("hashchange", handle);
}
