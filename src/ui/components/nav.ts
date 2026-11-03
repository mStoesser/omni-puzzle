import { html, nothing } from "lit-html";
import type { AnyPuzzleType } from "../../core/types.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { icon, logo } from "../icons.ts";
import type { IconName } from "../icons.ts";
import { sheet, typeTile } from "./ui.ts";

/** Main sections; null = a page outside the navigation (imprint, moderation …). */
export type NavSection = "home" | "gallery" | "library" | "account" | null;

/** Avatar in the navigation: initial of the user name, or null for the person icon (signed out, no backend). */
export type NavAccount = { initial: string | null };

type NavItem = { section: Exclude<NavSection, null>; href: string; text: MessageKey; icon: IconName };

const ITEMS: readonly NavItem[] = [
  { section: "home", href: "#/", text: "navHome", icon: "home" },
  { section: "gallery", href: "#/gallery", text: "navGallery", icon: "grid" },
  { section: "library", href: "#/library", text: "navLibrary", icon: "bookmark" },
  { section: "account", href: "#/account", text: "navProfile", icon: "user" },
];

function current(item: NavItem, active: NavSection) {
  return item.section === active ? "page" : nothing;
}

/** Mobile tab bar: Start · Galerie · Bauen · Meine · Profil. `gallery` false = no backend, the tab is left out. */
export function tabBar(active: NavSection, gallery: boolean, openBuild: () => void) {
  const items = ITEMS.filter((item) => gallery || item.section !== "gallery");
  const tab = (item: NavItem) => html`<a class="tab" href=${item.href} aria-current=${current(item, active)}>
    ${icon(item.icon, 22)}<span>${t(item.text)}</span>
  </a>`;
  const half = Math.ceil(items.length / 2);
  return html`<nav class="tabbar" aria-label=${t("navMain")}>
    ${items.slice(0, half).map(tab)}
    <button class="tab tab-build" @click=${openBuild}>
      <span class="tab-build-square">${icon("plus", 26)}</span><span class="visually-hidden">${t("navBuild")}</span>
    </button>
    ${items.slice(half).map(tab)}
  </nav>`;
}

/** Desktop navigation bar: logo, sections, build button and avatar. */
export function topNav(active: NavSection, gallery: boolean, account: NavAccount, openBuild: () => void) {
  const links = ITEMS.filter((item) => item.section !== "account" && (gallery || item.section !== "gallery"));
  return html`<header class="topnav">
    <div class="topnav-inner">
      <a class="brand" href="#/">${logo(32)}<span>${t("appTitle")}</span></a>
      <nav aria-label=${t("navMain")}>
        ${links.map((item) => html`<a class="topnav-link" href=${item.href} aria-current=${current(item, active)}>${t(item.text)}</a>`)}
      </nav>
      <span class="topnav-spacer"></span>
      <button class="primary topnav-build" @click=${openBuild}>${icon("plus", 18)}${t("navBuildLong")}</button>
      ${avatar(account, active === "account")}
    </div>
  </header>`;
}

export function avatar(account: NavAccount, isCurrent = false) {
  return html`<a class="avatar" href="#/account" aria-label=${t("navProfile")} aria-current=${isCurrent ? "page" : nothing}>
    ${account.initial ?? icon("user", 20)}
  </a>`;
}

/** Sheet to choose the type of a new puzzle. */
export function buildSheet(types: readonly AnyPuzzleType[], close: () => void) {
  return sheet(
    "build-title",
    close,
    html`<h2 id="build-title" class="sheet-title">${t("buildChoose")}</h2>
      <ul class="build-types">
        ${types.map(
          (type) => html`<li>
            <a class="build-type" href="#/new/${type.id}" @click=${close}>
              ${typeTile(type)}
              <span class="build-type-text">
                <span class="build-type-name">${t(type.name)}</span>
                <span class="build-type-desc">${t(type.description)}</span>
              </span>
              ${icon("chevronRight", 20)}
            </a>
          </li>`,
        )}
      </ul>`,
  );
}
