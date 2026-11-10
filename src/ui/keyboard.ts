import { ariaShortcut, shortcutHint } from "../core/shortcuts.ts";
import { t } from "../i18n/t.ts";

/** Apple devices use Cmd instead of Ctrl for shortcuts (M33). */
export function isMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
}

/** aria-keyshortcuts and tooltip text for a button with a shortcut, in the active language. */
export function buttonShortcut(action: "undo" | "redo" | "restart" | "mode") {
  const mac = isMac();
  return { aria: ariaShortcut(action, mac), hint: shortcutHint(action, mac, t("keyCtrl")) };
}
