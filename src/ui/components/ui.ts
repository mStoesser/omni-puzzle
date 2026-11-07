import { html, nothing } from "lit-html";
import type { TemplateResult } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import type { AnyPuzzleType, PuzzleLang } from "../../core/types.ts";
import { LANG_NAMES, t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { ICONS, icon, iconSvg } from "../icons.ts";
import type { IconName } from "../icons.ts";
import { showModal } from "./dialog.ts";

// Shared building blocks of the app shell (design spec, section 3). Styling lives in styles.css.

/** Style attribute with the type color for both themes; `.typed` elements pick the matching one. */
export function typeVars(type: AnyPuzzleType | undefined): string {
  return type ? `--type-d:${type.color.dark};--type-l:${type.color.light}` : "";
}

/** Icon tile in the type tint (44 px by default). */
export function typeTile(type: AnyPuzzleType | undefined, size: "md" | "sm" = "md") {
  return html`<span class="type-tile-icon typed ${size}" style=${typeVars(type)}>
    ${iconSvg(type?.icon ?? ICONS.puzzle, size === "md" ? 22 : 16)}
  </span>`;
}

/** Pill with the type name in its color; `extra` is appended after a middle dot (e.g. a level). */
export function typeBadge(type: AnyPuzzleType | undefined, fallbackName: string, withIcon = true) {
  return html`<span class="badge badge-type typed" style=${typeVars(type)}>
    ${withIcon ? iconSvg(type?.icon ?? ICONS.puzzle, 14) : nothing}${type ? t(type.name) : fallbackName}
  </span>`;
}

/** Language of a puzzle (M28) as a short code; the full name is read out. */
export function langBadge(lang: PuzzleLang) {
  return html`<span class="badge badge-lang"><abbr title=${LANG_NAMES[lang]} aria-label=${t("langBadge", { language: LANG_NAMES[lang] })}
      >${lang.toUpperCase()}</abbr
    ></span>`;
}

export type StatusKind = "solved" | "gallery" | "link" | "draft" | "saved" | "ready";

const STATUS: Record<StatusKind, { text: MessageKey; icon: IconName | null }> = {
  solved: { text: "solvedMark", icon: "check" },
  gallery: { text: "statusInGallery", icon: "globe" },
  link: { text: "statusShared", icon: "link" },
  draft: { text: "libraryDraft", icon: null },
  saved: { text: "statusSaved", icon: null },
  ready: { text: "libraryVerified", icon: "check" },
};

export function statusBadge(kind: StatusKind) {
  const { text, icon: name } = STATUS[kind];
  return html`<span class="badge badge-${kind}">${name ? icon(name, 14) : nothing}${t(text)}</span>`;
}

type IconButtonOptions = { label: string; icon: IconName; href?: string; onClick?: () => void; disabled?: boolean; pressed?: boolean };

/** 44×44 button or link with only an icon; `label` is its accessible name. */
export function iconButton(o: IconButtonOptions) {
  if (o.href !== undefined) {
    return html`<a class="icon-button" href=${o.href} aria-label=${o.label} title=${o.label}>${icon(o.icon, 20)}</a>`;
  }
  // type="button": never submits a surrounding form (e.g. reordering in the chain editor).
  return html`<button
    type="button"
    class="icon-button"
    aria-label=${o.label}
    title=${o.label}
    aria-pressed=${o.pressed === undefined ? nothing : String(o.pressed)}
    ?disabled=${o.disabled ?? false}
    @click=${o.onClick}
  >
    ${icon(o.icon, 20)}
  </button>`;
}

/** `lang`: language of the label if it differs from the page (a language name in itself). */
export type SegmentOption<V extends string> = { value: V; label: string; icon?: IconName; lang?: string };

/** Segment control as a radio group (exactly one option active). */
export function segment<V extends string>(label: string, options: readonly SegmentOption<V>[], value: V, select: (value: V) => void) {
  return html`<div class="segment" role="radiogroup" aria-label=${label}>
    ${options.map(
      (o) => html`<button
        role="radio"
        lang=${o.lang ?? nothing}
        aria-checked=${o.value === value ? "true" : "false"}
        tabindex=${o.value === value ? "0" : "-1"}
        @click=${() => select(o.value)}
        @keydown=${(e: KeyboardEvent) => segmentKey(e, options, value, select)}
      >
        ${o.icon ? icon(o.icon, 16) : nothing}${o.label}
      </button>`,
    )}
  </div>`;
}

function segmentKey<V extends string>(e: KeyboardEvent, options: readonly SegmentOption<V>[], value: V, select: (value: V) => void) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  e.preventDefault();
  const index = options.findIndex((o) => o.value === value);
  const next = options[(index + step + options.length) % options.length]!;
  select(next.value);
  const group = (e.currentTarget as Element).parentElement;
  queueMicrotask(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
}

/** Filter chip; `type` adds the colored dot of a puzzle type. */
export function chip(label: string, pressed: boolean, onClick: () => void, type?: AnyPuzzleType) {
  return html`<button class="chip ${type ? "typed" : ""}" style=${typeVars(type)} aria-pressed=${pressed ? "true" : "false"} @click=${onClick}>
    ${type ? html`<span class="chip-dot" aria-hidden="true"></span>` : nothing}${label}
  </button>`;
}

/** Stat tile: small label above a number in the display font. */
export function stat(label: string, value: string | number, tone: "" | "ok" = "") {
  return html`<div class="stat ${tone}">
    <span class="stat-label">${label}</span>
    <span class="stat-value">${value}</span>
  </div>`;
}

/** Uppercase section label (Inter 600, 12 px, muted). */
export function label(text: string, id?: string) {
  return html`<p class="label" id=${id ?? nothing}>${text}</p>`;
}

/** The sheet whose backdrop received the current press, if any. */
let backdropPress: EventTarget | null = null;

/**
 * Bottom sheet on a native modal <dialog>: focus trap, Escape and the backdrop come from the browser.
 * `onClose` runs when the dialog closes (Escape, close button); the caller then removes it from the state.
 */
export function sheet(labelledBy: string, onClose: () => void, content: TemplateResult, extraClass = "") {
  return html`<dialog
    class="sheet ${extraClass}"
    aria-labelledby=${labelledBy}
    ${ref(showModal)}
    @close=${onClose}
    @pointerdown=${(e: PointerEvent) => {
      backdropPress = e.target === e.currentTarget ? e.currentTarget : null;
    }}
    @click=${(e: Event) => {
      // A click on the backdrop hits the dialog element itself. Only a press that started there closes:
      // the click that follows the tap which opened the sheet (e.g. the solving move) must not close it again.
      const dialog = e.currentTarget as HTMLDialogElement;
      if (e.target === dialog && backdropPress === dialog) dialog.close();
      backdropPress = null;
    }}
  >
    <div class="sheet-body">
      <span class="sheet-handle" aria-hidden="true"></span>
      ${content}
    </div>
  </dialog>`;
}

export type MenuItem = { icon: IconName; text: string; href?: string; onClick?: () => void; danger?: boolean };

/**
 * "More" button with a menu on the native popover API (light dismiss, Escape, top layer).
 * The menu opens below the button, right-aligned; the position is set when it opens.
 */
export function popoverMenu(id: string, label: string, items: readonly MenuItem[], buttonClass = "icon-button") {
  return html`<button class=${buttonClass} popovertarget=${id} aria-label=${label} title=${label}>${icon("more", 20)}</button>
    <div class="menu" id=${id} popover role="menu" aria-label=${label} @toggle=${placeMenu}>
      ${items.map((item) => menuEntry(item))}
    </div>`;
}

function placeMenu(e: Event) {
  const menu = e.currentTarget as HTMLElement;
  if ((e as ToggleEvent).newState !== "open") return;
  const button = document.querySelector(`[popovertarget="${CSS.escape(menu.id)}"]`);
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const below = rect.bottom + 6;
  const fitsBelow = below + menu.offsetHeight <= window.innerHeight - 8;
  menu.style.top = `${fitsBelow ? below : Math.max(8, rect.top - 6 - menu.offsetHeight)}px`;
  menu.style.right = `${Math.max(8, document.documentElement.clientWidth - rect.right)}px`;
}

function menuEntry(item: MenuItem) {
  const close = (e: Event) => (e.currentTarget as Element).closest<HTMLElement>("[popover]")?.hidePopover();
  const cls = `menu-item ${item.danger ? "danger-item" : ""}`;
  return item.href
    ? html`<a class=${cls} role="menuitem" href=${item.href} @click=${close}>${icon(item.icon, 18)}${item.text}</a>`
    : html`<button
        class=${cls}
        role="menuitem"
        @click=${(e: Event) => {
          close(e);
          item.onClick?.();
        }}
      >
        ${icon(item.icon, 18)}${item.text}
      </button>`;
}

/** Page header with a back link (pages outside the main navigation, e.g. imprint). */
export function backHeader(href: string, title: string) {
  return html`<header class="back-head">
    ${iconButton({ label: t("back"), icon: "chevronLeft", href })}
    <h1>${title}</h1>
  </header>`;
}
