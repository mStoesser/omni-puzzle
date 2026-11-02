import { html, nothing } from "lit-html";
import { MODERATION_LIMIT } from "../../core/moderation.ts";
import type { ModerationItem } from "../../core/moderation.ts";
import type { Registry } from "../../core/registry.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { REASON_TEXT } from "../components/report-dialog.ts";

export type ModerationViewModel = {
  status: "loading" | "idle" | "error";
  items: ModerationItem[];
  message: { tone: "ok" | "error"; text: MessageKey } | null;
  busy: boolean; // an action is running
  confirmDelete: string | null; // puzzle id waiting for confirmation
};

export type ModerationViewActions = {
  release(puzzleId: string): void;
  hide(puzzleId: string): void;
  askDelete(puzzleId: string | null): void;
  remove(puzzleId: string): void;
  setBanned(userId: string, ban: boolean): void;
  resetName(userId: string): void;
};

const date = (iso: string) => new Date(iso).toLocaleDateString("de-DE");

export function moderationView(model: ModerationViewModel, registry: Registry, actions: ModerationViewActions) {
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/account" aria-label=${t("back")}>←</a>
      <h1 class="toolbar-title">${t("moderation")}</h1>
    </header>
    <p>${t("moderationIntro")}</p>
    ${model.message
      ? html`<p class=${model.message.tone === "ok" ? "account-ok" : "notice"} role=${model.message.tone === "ok" ? "status" : "alert"}>
          ${t(model.message.text)}
        </p>`
      : nothing}
    ${model.status === "loading"
      ? html`<p role="status">${t("loading")}</p>`
      : model.items.length === 0 && model.status === "idle"
        ? html`<p>${t("moderationEmpty")}</p>`
        : html`<ul class="publication-list">
            ${model.items.map((item) => moderationItem(item, model, registry, actions))}
          </ul>
          ${model.items.length >= MODERATION_LIMIT ? html`<p class="hint">${t("moderationLimit", { limit: MODERATION_LIMIT })}</p>` : nothing}`}
  `;
}

function moderationItem(item: ModerationItem, model: ModerationViewModel, registry: Registry, actions: ModerationViewActions) {
  const type = registry.get(item.type);
  const { author } = item;
  const { busy } = model;
  return html`<li class="publication">
    <h2 class="moderation-title"><a href="#/g/${item.id}">${item.title}</a></h2>
    <p class="hint">
      ${type ? t(type.name) : item.type} · ${date(item.publishedAt)} ·
      <strong>${item.hidden ? t("moderationHidden") : t("moderationVisible")}</strong>
      ${item.reports.length > 0 ? html` · ${t("moderationReports", { count: item.reports.length })}` : nothing}
    </p>
    <p>
      ${t("moderationAuthor", { author: author?.username ?? t("galleryByUnknown") })}
      ${author?.banned ? html` · <strong>${t("moderationAuthorBanned")}</strong>` : nothing}
    </p>
    ${item.reports.length === 0
      ? nothing
      : html`<ul class="moderation-reports">
          ${item.reports.map(
            (report) => html`<li>
              <span class="hint">
                ${t("moderationReportBy", {
                  reason: t(REASON_TEXT[report.reason]),
                  reporter: report.reporter ?? t("galleryByUnknown"),
                  date: date(report.createdAt),
                })}
              </span>
              ${report.comment ? html`<span class="moderation-comment">${report.comment}</span>` : nothing}
            </li>`,
          )}
        </ul>`}
    ${model.confirmDelete === item.id
      ? html`<p class="notice" role="alert">${t("moderationDeleteConfirm", { title: item.title })}</p>
          <div class="account-actions">
            <button class="danger-button" ?disabled=${busy} @click=${() => actions.remove(item.id)}>${t("moderationDelete")}</button>
            <button class="secondary" @click=${() => actions.askDelete(null)}>${t("cancel")}</button>
          </div>`
      : html`<div class="account-actions">
          <button ?disabled=${busy} @click=${() => actions.release(item.id)}>${t("moderationRelease")}</button>
          ${item.hidden && item.reports.length === 0
            ? nothing
            : html`<button class="secondary" ?disabled=${busy} @click=${() => actions.hide(item.id)}>${t("moderationHide")}</button>`}
          <button class="secondary danger" ?disabled=${busy} @click=${() => actions.askDelete(item.id)}>${t("moderationDelete")}</button>
          ${author && !author.isModerator
            ? html`
                <button class="secondary" ?disabled=${busy} @click=${() => actions.setBanned(author.id, !author.banned)}>
                  ${author.banned ? t("moderationUnban") : t("moderationBan")}
                </button>
                <button class="secondary" ?disabled=${busy} @click=${() => actions.resetName(author.id)}>${t("moderationResetName")}</button>
              `
            : nothing}
        </div>`}
  </li>`;
}
