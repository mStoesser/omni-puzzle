import { html, nothing } from "lit-html";
import { MODERATION_LIMIT } from "../../core/moderation.ts";
import type { PlannedDay } from "../../core/daily.ts";
import type { ModerationItem } from "../../core/moderation.ts";
import { loadDocument } from "../../core/document.ts";
import type { Registry } from "../../core/registry.ts";
import { locale, t, tn } from "../../i18n/t.ts";
import { backHeader } from "../components/ui.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { REASON_TEXT } from "../components/report-dialog.ts";
import { formatDay } from "../time.ts";

export type ModerationViewModel = {
  status: "loading" | "idle" | "error";
  items: ModerationItem[];
  message: { tone: "ok" | "error"; text: MessageKey } | null;
  busy: boolean; // an action is running
  confirmDelete: string | null; // puzzle id waiting for confirmation
  plan: DailyPlanModel;
};

/** Puzzle of the day (M26): today and the next 14 days. */
export type DailyPlanModel = {
  status: "loading" | "idle" | "error";
  days: PlannedDay[]; // starts with today
  busy: boolean;
  message: { tone: "ok" | "error"; text: MessageKey } | null;
};

/** `imageUrl` builds the public URL of a published picture. */
export type ModerationViewActions = {
  release(item: ModerationItem): void;
  hide(item: ModerationItem): void;
  askDelete(id: string | null): void;
  remove(item: ModerationItem): void;
  setBanned(userId: string, ban: boolean): void;
  resetName(userId: string): void;
  clearScores(userId: string): void; // removes the user from every leaderboard
  imageUrl(puzzleId: string, key: string): string | null;
  /** Plans the puzzle behind a #/g/ link (or its id) for a day; true = done, the form is cleared. */
  planDaily(day: string, link: string): Promise<boolean>;
  unplanDaily(day: string): void;
};

const date = (iso: string) => new Date(iso).toLocaleDateString(locale());

export function moderationView(model: ModerationViewModel, registry: Registry, actions: ModerationViewActions) {
  return html`
    ${backHeader("#/account", t("moderation"))}
    ${dailyPlan(model.plan, registry, actions)}
    <h2>${t("moderationQueue")}</h2>
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
    <h2 class="moderation-title"><a href=${item.kind === "chain" ? `#/c/${item.id}` : `#/g/${item.id}`}>${item.title}</a></h2>
    <p class="hint">
      ${item.kind === "chain" ? t("moderationChain", { steps: tn("chainSteps", item.stepCount) }) : type ? t(type.name) : item.type} · ${date(item.publishedAt)} ·
      <strong>${item.hidden ? t("moderationHidden") : t("moderationVisible")}</strong>
      ${item.reports.length > 0 ? html` · ${tn("moderationReports", item.reports.length)}` : nothing}
    </p>
    <p>
      ${t("moderationAuthor", { author: author?.username ?? t("galleryByUnknown") })}
      ${author?.banned ? html` · <strong>${t("moderationAuthorBanned")}</strong>` : nothing}
    </p>
    ${images(item, registry, actions)}
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
            <button class="danger-button" ?disabled=${busy} @click=${() => actions.remove(item)}>${t("moderationDelete")}</button>
            <button class="secondary" @click=${() => actions.askDelete(null)}>${t("cancel")}</button>
          </div>`
      : html`<div class="account-actions">
          <button ?disabled=${busy} @click=${() => actions.release(item)}>${t("moderationRelease")}</button>
          ${item.hidden && item.reports.length === 0
            ? nothing
            : html`<button class="secondary" ?disabled=${busy} @click=${() => actions.hide(item)}>${t("moderationHide")}</button>`}
          <button class="secondary danger" ?disabled=${busy} @click=${() => actions.askDelete(item.id)}>${t("moderationDelete")}</button>
          ${author && !author.isModerator
            ? html`
                <button class="secondary" ?disabled=${busy} @click=${() => actions.setBanned(author.id, !author.banned)}>
                  ${author.banned ? t("moderationUnban") : t("moderationBan")}
                </button>
                <button class="secondary" ?disabled=${busy} @click=${() => actions.resetName(author.id)}>${t("moderationResetName")}</button>
                <button class="secondary" ?disabled=${busy} @click=${() => actions.clearScores(author.id)}>${t("moderationClearScores")}</button>
              `
            : nothing}
        </div>`}
  </li>`;
}

function dailyPlan(plan: DailyPlanModel, registry: Registry, actions: ModerationViewActions) {
  const today = plan.days[0]?.day ?? null;
  return html`<section class="box daily-plan" aria-labelledby="daily-plan-title">
    <h2 id="daily-plan-title">${t("dailyPlanTitle")}</h2>
    <p class="hint">${t("dailyPlanIntro")}</p>
    ${plan.message
      ? html`<p class=${plan.message.tone === "ok" ? "account-ok" : "notice"} role=${plan.message.tone === "ok" ? "status" : "alert"}>
          ${t(plan.message.text)}
        </p>`
      : nothing}
    ${plan.status === "loading"
      ? html`<p role="status">${t("loading")}</p>`
      : plan.days.length === 0
        ? nothing
        : html`<ol class="daily-plan-list">
              ${plan.days.map((entry) => planRow(entry, entry.day === today, plan.busy, registry, actions))}
            </ol>
            <form class="daily-plan-form" @submit=${async (e: SubmitEvent) => {
              e.preventDefault();
              const form = e.currentTarget as HTMLFormElement;
              const data = new FormData(form);
              if (await actions.planDaily(String(data.get("day") ?? ""), String(data.get("link") ?? ""))) form.reset();
            }}>
              <label class="field">
                <span>${t("dailyPlanDayLabel")}</span>
                <select name="day">
                  ${plan.days.map(
                    (entry) => html`<option value=${entry.day}>${formatDay(entry.day)}${entry.day === today ? ` (${t("dailyPlanToday")})` : ""}</option>`,
                  )}
                </select>
              </label>
              <label class="field">
                <span>${t("dailyPlanLinkLabel")}</span>
                <input type="text" name="link" required inputmode="url" autocomplete="off" placeholder="…/#/g/…" />
                <span class="hint">${t("dailyPlanLinkHint")}</span>
              </label>
              <button type="submit" ?disabled=${plan.busy}>${t("dailyPlanSubmit")}</button>
            </form>`}
  </section>`;
}

function planRow(entry: PlannedDay, isToday: boolean, busy: boolean, registry: Registry, actions: ModerationViewActions) {
  const { puzzle } = entry;
  const type = puzzle ? registry.get(puzzle.type) : undefined;
  return html`<li class="daily-plan-row ${isToday ? "today" : ""}">
    <span class="daily-plan-day">${formatDay(entry.day)}${isToday ? html` <strong>${t("dailyPlanToday")}</strong>` : nothing}</span>
    <span class="daily-plan-puzzle">
      ${puzzle
        ? html`<a href="#/g/${puzzle.id}">${puzzle.title}</a>
            <span class="hint">
              ${type ? t(type.name) : puzzle.type} ·
              ${entry.plannedBy ? t("dailyPlanBy", { name: entry.plannedBy }) : t("dailyPlanAutomatic")}
              ${puzzle.hidden ? html` · <strong>${t("moderationHidden")}</strong>` : nothing}
            </span>`
        : html`<span class="hint">${t(isToday ? "dailyPlanNoneToday" : "dailyPlanOpen")}</span>`}
    </span>
    ${puzzle && !isToday
      ? html`<button class="link-button" ?disabled=${busy} @click=${() => actions.unplanDaily(entry.day)}
          aria-label=${t("dailyPlanRemoveFor", { day: formatDay(entry.day) })}>${t("dailyPlanRemove")}</button>`
      : nothing}
  </li>`;
}

/** Thumbnails of the puzzle's pictures, so moderators see them without playing. */
function images(item: ModerationItem, registry: Registry, actions: ModerationViewActions) {
  if (item.kind === "chain") return nothing;
  let keys: string[] = [];
  try {
    const { type, doc } = loadDocument(item.doc, registry);
    keys = type.imageKeys?.(doc.data) ?? [];
  } catch {
    return nothing; // broken documents are shown without images
  }
  const urls = keys.flatMap((key) => {
    const url = actions.imageUrl(item.id, key);
    return url ? [url] : [];
  });
  if (urls.length === 0) return nothing;
  return html`<div class="moderation-images">
    ${urls.map((url, i) => html`<a href=${url} target="_blank" rel="noopener"><img src=${url} alt=${t("moderationImage", { number: i + 1 })} loading="lazy" /></a>`)}
  </div>`;
}
