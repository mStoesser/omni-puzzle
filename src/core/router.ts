export type Route =
  | { name: "home" }
  | { name: "library" }
  | { name: "imprint" }
  | { name: "privacy" }
  | { name: "account" }
  | { name: "shared"; code: string }
  | { name: "new"; type: string }
  | { name: "edit"; id: string }
  | { name: "play"; id: string }
  | { name: "published"; id: string };

const TYPE_ID = /^[a-z0-9-]{1,32}$/;
const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHARE_CODE = /^[A-Za-z0-9._-]+$/;
const PUBLISHED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const HOME: Route = { name: "home" };

/** Parses a location hash like "#/play/abc". Anything unknown maps to home. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "") return HOME;
  const [head, arg, ...rest] = path.split("/");
  if (rest.length > 0) return HOME;

  if (arg === undefined) {
    if (head === "library") return { name: "library" };
    if (head === "impressum") return { name: "imprint" };
    if (head === "datenschutz") return { name: "privacy" };
    if (head === "account") return { name: "account" };
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
    default:
      return HOME;
  }
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "library":
      return "#/library";
    case "imprint":
      return "#/impressum";
    case "privacy":
      return "#/datenschutz";
    case "account":
      return "#/account";
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
