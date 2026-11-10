import { html, nothing } from "lit-html";
import { PASSWORD_MIN, USERNAME } from "../../core/account.ts";
import type { Profile } from "../../core/account.ts";
import { PUBLISH } from "../../core/publish.ts";
import type { OwnChain } from "../../core/chains.ts";
import type { OwnPublication } from "../../core/published.ts";
import { LANG_NAMES, LANGS, locale, t, tn } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";
import { segment, sheet, stat } from "../components/ui.ts";
import { icon } from "../icons.ts";
import type { IconName } from "../icons.ts";
import type { ThemeChoice } from "../theme.ts";
import type { LanguageChoice } from "../language.ts";
import { timeAgo } from "../time.ts";

export type AccountMode = "signIn" | "signUp" | "reset" | "newPassword";

export type AccountMessage = { tone: "ok" | "error"; text: MessageKey };

export type AccountViewModel = {
  user: { id: string; email: string } | null; // null = signed out
  profile: Profile | null; // null while loading or if missing
  mode: AccountMode;
  busy: boolean;
  message: AccountMessage | null;
  confirmDelete: boolean;
  publications: (OwnPublication & { typeName: string })[] | null; // null = not loaded yet
  chains: OwnChain[] | null; // null = not loaded yet
  editingPublication: string | null; // id (puzzle or chain) with the open edit form
  confirmWithdraw: string | null; // id (puzzle or chain) waiting for confirmation
  panel: AccountPanel | null; // open settings sheet
  sync: SyncViewModel;
};

/**
 * Sync with the account (M27). "choice": another account's data is on this device, nothing syncs until the user
 * decides. `rejected`: puzzles the server did not take (limits) in the last run.
 */
export type SyncViewModel = {
  status: "off" | "idle" | "running" | "error" | "choice";
  lastSync: string | null;
  error: MessageKey | null;
  rejected: number;
};

/** Settings that open in a sheet. */
export type AccountPanel = "name" | "password" | "publications" | "chains";

/** Device settings and numbers shown with or without an account. */
export type ProfileExtras = {
  theme: ThemeChoice;
  language: LanguageChoice;
  showTimer: boolean; // M34: running time while playing
  stats: { solved: number; built: number };
};

export type ProfileActions = {
  setTheme(theme: ThemeChoice): void;
  setLanguage(choice: LanguageChoice): void;
  setShowTimer(show: boolean): void;
};

/** Actions resolve to true on success, so the view can clear the form. */
export type AccountActions = {
  setMode(mode: AccountMode): void;
  signIn(email: string, password: string): Promise<boolean>;
  signUp(username: string, email: string, password: string): Promise<boolean>;
  requestReset(email: string): Promise<boolean>;
  setNewPassword(password: string): Promise<boolean>;
  rename(username: string): Promise<boolean>;
  signOut(): void;
  askDelete(confirm: boolean): void;
  deleteAccount(): void;
  editPublication(id: string | null): void;
  savePublication(id: string, title: string, description: string): Promise<boolean>;
  askWithdraw(id: string | null): void;
  withdraw(id: string): void;
  saveChain(id: string, title: string, description: string): Promise<boolean>;
  withdrawChain(id: string): void;
  openPanel(panel: AccountPanel | null): void;
  syncNow(): void;
  /** Answer to "choice": take the device's data into the account, or remove it from the device. */
  resolveSync(choice: "merge" | "replace"): void;
};

const TITLE: Record<AccountMode, MessageKey> = {
  signIn: "accountSignIn",
  signUp: "accountSignUp",
  reset: "accountReset",
  newPassword: "accountNewPassword",
};

/**
 * Profile page. `model` null = no backend (no accounts): only the device settings are shown.
 * Signed out, the sign-in forms take the place of the profile card.
 */
export function accountView(model: AccountViewModel | null, actions: AccountActions | null, extras: ProfileExtras, profileActions: ProfileActions) {
  const signedIn = model !== null && model.user !== null && model.mode !== "newPassword";
  return html`
    ${model && actions
      ? signedIn
        ? profileHead(model, extras)
        : html`<header class="page-head"><h1>${t(TITLE[model.mode])}</h1></header>
            ${message(model)} ${authForm(model, actions)}`
      : html`<header class="page-head"><h1>${t("navProfile")}</h1></header>
          <p class="info-box">${icon("info", 18)}<span>${t("accountUnavailable")}</span></p>`}
    ${signedIn
      ? model.sync.status === "choice"
        ? html`${message(model)} ${syncSection(model, actions!)} ${profileSettings(model, actions!)}`
        : html`${message(model)} ${profileSettings(model, actions!)} ${syncSection(model, actions!)}`
      : nothing}

    <p class="label settings-label" id="settings-look">${t("profileLook")}</p>
    ${segment(
      t("profileTheme"),
      [
        { value: "dark", label: t("themeDark") },
        { value: "light", label: t("themeLight") },
        { value: "system", label: t("themeSystem") },
      ],
      extras.theme,
      profileActions.setTheme,
    )}
    <p class="label settings-label" id="settings-language">${t("profileLanguage")}</p>
    ${segment<LanguageChoice>(
      t("profileLanguage"),
      [{ value: "system", label: t("languageSystem") }, ...LANGS.map((lang) => ({ value: lang, label: LANG_NAMES[lang], lang }))],
      extras.language,
      profileActions.setLanguage,
    )}
    <p class="label settings-label" id="settings-timer">${t("profileTimer")}</p>
    ${segment<"show" | "hide">(
      t("profileTimer"),
      [
        { value: "show", label: t("timerShow") },
        { value: "hide", label: t("timerHide") },
      ],
      extras.showTimer ? "show" : "hide",
      (value) => profileActions.setShowTimer(value === "show"),
    )}
    <p class="hint settings-hint">${t("profileTimerHint")}</p>

    <p class="label settings-label">${t("profileLegal")}</p>
    <ul class="settings">
      <li>${row({ href: "#/impressum", text: t("imprint") })}</li>
      <li>${row({ href: "#/datenschutz", text: t("privacy") })}</li>
    </ul>

    ${signedIn ? accountActions(model, actions!) : nothing}
    ${signedIn && model.panel ? panelSheet(model, actions!) : nothing}
  `;
}

function message(model: AccountViewModel) {
  return model.message
    ? html`<p class=${model.message.tone === "ok" ? "account-ok" : "notice"} role=${model.message.tone === "ok" ? "status" : "alert"}>
        ${t(model.message.text)}
      </p>`
    : nothing;
}

function profileHead(model: AccountViewModel, extras: ProfileExtras) {
  const name = model.profile?.username ?? "…";
  const likes = model.publications?.reduce((sum, p) => sum + p.likeCount, 0);
  return html`<header class="profile-head">
      <span class="profile-avatar" aria-hidden="true">${name.slice(0, 1).toUpperCase()}</span>
      <h1>${name}</h1>
      <p>${model.user?.email}</p>
    </header>
    <div class="stats profile-stats">
      ${stat(t("profileSolved"), extras.stats.solved)} ${stat(t("profileBuilt"), extras.stats.built)}
      ${stat(t("profileLikes"), likes ?? "–")}
    </div>
    ${model.profile?.banned ? html`<p class="notice">${t("accountBanned")}</p>` : nothing}`;
}

type RowOptions = { text: string; value?: string | number; href?: string; onClick?: () => void; icon?: IconName };

/** A 56 px settings row: link or button, value and chevron on the right. */
function row(o: RowOptions) {
  const content = html`${o.icon ? icon(o.icon, 20) : nothing}<span>${o.text}</span>
    ${o.value === undefined ? nothing : html`<span class="value">${o.value}</span>`}${icon("chevronRight", 18)}`;
  return o.href !== undefined
    ? html`<a class="settings-row" href=${o.href}>${content}</a>`
    : html`<button class="settings-row" aria-haspopup="dialog" @click=${o.onClick}>${content}</button>`;
}

function profileSettings(model: AccountViewModel, actions: AccountActions) {
  const { profile, publications } = model;
  return html`<p class="label settings-label">${t("profileSection")}</p>
    <ul class="settings">
      <li>${row({ text: t("accountUsername"), value: profile?.username ?? "…", onClick: () => actions.openPanel("name") })}</li>
      <li>${row({ text: t("accountChangePassword"), onClick: () => actions.openPanel("password") })}</li>
      <li>${row({ text: t("myPublications"), value: publications?.length ?? "…", onClick: () => actions.openPanel("publications") })}</li>
      <li>${row({ text: t("myChains"), value: model.chains?.length ?? "…", onClick: () => actions.openPanel("chains") })}</li>
      ${profile?.isModerator ? html`<li>${row({ text: t("moderationLink"), href: "#/moderation", icon: "shield" })}</li>` : nothing}
    </ul>`;
}

function syncSection(model: AccountViewModel, actions: AccountActions) {
  const { sync } = model;
  if (sync.status === "off") return nothing;
  if (sync.status === "choice") {
    return html`<p class="label settings-label">${t("syncTitle")}</p>
      <section class="box sync-box" aria-label=${t("syncTitle")}>
        <p class="info-box" role="alert">${icon("info", 18)}<span>${t("syncChoice")}</span></p>
        <div class="account-actions">
          <button type="button" @click=${() => actions.resolveSync("merge")}>${t("syncChoiceMerge")}</button>
          <button type="button" class="secondary danger" @click=${() => actions.resolveSync("replace")}>${t("syncChoiceReplace")}</button>
        </div>
        <p class="hint">${t("syncChoiceReplaceHint")}</p>
      </section>`;
  }
  const running = sync.status === "running";
  return html`<p class="label settings-label">${t("syncTitle")}</p>
    <section class="box sync-box" aria-label=${t("syncTitle")}>
      <p class="hint">${t("syncIntro")}</p>
      <p class="sync-status" role="status">
        ${icon("refresh", 18)}
        <span>${running ? t("syncRunning") : lastSyncText(sync.lastSync, Date.now())}</span>
      </p>
      ${sync.status === "error" && sync.error ? html`<p class="notice" role="alert">${t("syncFailed", { reason: t(sync.error) })}</p>` : nothing}
      ${sync.rejected > 0 ? html`<p class="notice">${tn("syncRejected", sync.rejected)}</p>` : nothing}
      <button type="button" class="secondary" ?disabled=${running} @click=${actions.syncNow}>${t("syncNow")}</button>
    </section>`;
}

export function lastSyncText(lastSync: string | null, now: number): string {
  if (lastSync === null) return t("syncNever");
  if (now - Date.parse(lastSync) < 60_000) return t("syncJustNow");
  return t("syncLast", { time: timeAgo(lastSync, now) });
}

function accountActions(model: AccountViewModel, actions: AccountActions) {
  const { busy } = model;
  return html`<button type="button" class="secondary block sign-out" ?disabled=${busy} @click=${actions.signOut}>
      ${icon("logOut", 18)}${t("accountSignOut")}
    </button>
    <section class="danger-box" aria-labelledby="delete-heading">
      <h2 id="delete-heading" class="visually-hidden">${t("accountDelete")}</h2>
      <p>${t("accountDeleteIntro")}</p>
      ${model.confirmDelete
        ? html`
            <p class="notice" role="alert">${t("accountDeleteConfirm")}</p>
            <div class="account-actions">
              <button type="button" class="danger-button" ?disabled=${busy} @click=${actions.deleteAccount}>
                ${t("accountDeleteFinal")}
              </button>
              <button type="button" class="secondary" @click=${() => actions.askDelete(false)}>${t("cancel")}</button>
            </div>
          `
        : html`<button type="button" class="danger" @click=${() => actions.askDelete(true)}>${t("accountDeleteAsk")}</button>`}
    </section>`;
}

function panelSheet(model: AccountViewModel, actions: AccountActions) {
  const { profile, busy } = model;
  const close = () => actions.openPanel(null);
  // Forms close the sheet after success; the message then shows on the page.
  const done = (ok: boolean) => {
    if (ok) close();
    return ok;
  };
  const head = (text: string) => html`<div class="sheet-head">
    <h2 id="panel-title" class="sheet-title">${text}</h2>
    <button class="icon-button" aria-label=${t("close")} @click=${close}>${icon("close", 20)}</button>
  </div>`;
  switch (model.panel) {
    case "name":
      return sheet(
        "panel-title",
        close,
        html`${head(t("accountRename"))} ${message(model)}
          <form class="account-form" @submit=${onSubmit(async (f) => done(await actions.rename(field(f, "username"))))}>
            ${usernameField(profile?.username ?? "")}
            <button type="submit" class="large" ?disabled=${busy || !profile}>${t("accountSave")}</button>
          </form>`,
      );
    case "password":
      return sheet(
        "panel-title",
        close,
        html`${head(t("accountChangePassword"))} ${message(model)}
          <form class="account-form" @submit=${onSubmit(async (f) => done(await actions.setNewPassword(field(f, "password"))))}>
            ${passwordField("new-password", t("accountNewPasswordLabel"))}
            <button type="submit" class="large" ?disabled=${busy}>${t("accountSave")}</button>
          </form>`,
      );
    case "publications":
      return sheet("panel-title", close, html`${head(t("myPublications"))} ${message(model)} ${publicationList(model, actions)}`);
    case "chains":
      return sheet(
        "panel-title",
        close,
        html`${head(t("myChains"))} ${message(model)} ${chainList(model, actions)}
          <a class="button secondary block" href="#/chain/new">${icon("plus", 18)}${t("chainNewButton")}</a>`,
      );
    default:
      return nothing;
  }
}

/** Submits a form: reads its fields, runs the action, clears the form on success. */
function onSubmit(run: (form: FormData) => Promise<boolean> | void) {
  return async (e: SubmitEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if ((await run(new FormData(form))) === true) form.reset();
  };
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

function authForm(model: AccountViewModel, actions: AccountActions) {
  const { mode, busy } = model;
  const modeLink = (target: AccountMode, label: MessageKey) =>
    html`<button type="button" class="link-button" @click=${() => actions.setMode(target)}>${t(label)}</button>`;

  switch (mode) {
    case "signIn":
      return html`
        <p>${t("accountIntro")}</p>
        <form class="account-form" @submit=${onSubmit((f) => actions.signIn(field(f, "email"), field(f, "password")))}>
          ${emailField()}
          ${passwordField("current-password", t("accountPassword"))}
          <button type="submit" ?disabled=${busy}>${t("accountSignIn")}</button>
        </form>
        <p class="account-links">${modeLink("reset", "accountForgot")} ${modeLink("signUp", "accountToSignUp")}</p>
      `;
    case "signUp":
      return html`
        <p>${t("accountSignUpIntro")}</p>
        <form
          class="account-form"
          @submit=${onSubmit((f) => actions.signUp(field(f, "username"), field(f, "email"), field(f, "password")))}
        >
          ${usernameField("")}
          ${emailField()}
          ${passwordField("new-password", t("accountPassword"))}
          <button type="submit" ?disabled=${busy}>${t("accountSignUp")}</button>
        </form>
        <p class="hint">${t("accountSignUpPrivacy")} <a href="#/datenschutz">${t("privacyTitle")}</a></p>
        <p class="account-links">${modeLink("signIn", "accountToSignIn")}</p>
      `;
    case "reset":
      return html`
        <p>${t("accountResetIntro")}</p>
        <form class="account-form" @submit=${onSubmit((f) => actions.requestReset(field(f, "email")))}>
          ${emailField()}
          <button type="submit" ?disabled=${busy}>${t("accountResetSend")}</button>
        </form>
        <p class="account-links">${modeLink("signIn", "accountToSignIn")}</p>
      `;
    case "newPassword":
      return html`
        <form class="account-form" @submit=${onSubmit((f) => actions.setNewPassword(field(f, "password")))}>
          ${passwordField("new-password", t("accountNewPasswordLabel"))}
          <button type="submit" ?disabled=${busy}>${t("accountSave")}</button>
        </form>
      `;
  }
}

function profileSection(model: AccountViewModel, actions: AccountActions) {
  const { profile, busy } = model;
  return html`
    <dl class="account-facts">
      <dt>${t("accountUsername")}</dt>
      <dd>${profile?.username ?? "…"}</dd>
      <dt>${t("accountEmail")}</dt>
      <dd>${model.user?.email}</dd>
    </dl>
    ${profile?.banned ? html`<p class="notice">${t("accountBanned")}</p>` : nothing}
    ${profile?.isModerator ? html`<p><a class="button secondary" href="#/moderation">${t("moderationLink")}</a></p>` : nothing}

    <h2>${t("myPublications")}</h2>
    ${publicationList(model, actions)}

    <h2>${t("accountRename")}</h2>
    <form class="account-form" @submit=${onSubmit((f) => actions.rename(field(f, "username")))}>
      ${usernameField(profile?.username ?? "")}
      <button type="submit" ?disabled=${busy || !profile}>${t("accountSave")}</button>
    </form>

    <h2>${t("accountChangePassword")}</h2>
    <form class="account-form" @submit=${onSubmit((f) => actions.setNewPassword(field(f, "password")))}>
      ${passwordField("new-password", t("accountNewPasswordLabel"))}
      <button type="submit" ?disabled=${busy}>${t("accountSave")}</button>
    </form>

    <h2>${t("accountSignOutHeading")}</h2>
    <button type="button" class="secondary" ?disabled=${busy} @click=${actions.signOut}>${t("accountSignOut")}</button>

    <h2>${t("accountDelete")}</h2>
    <p>${t("accountDeleteIntro")}</p>
    ${model.confirmDelete
      ? html`
          <p class="notice" role="alert">${t("accountDeleteConfirm")}</p>
          <div class="account-actions">
            <button type="button" class="danger-button" ?disabled=${busy} @click=${actions.deleteAccount}>
              ${t("accountDeleteFinal")}
            </button>
            <button type="button" class="secondary" @click=${() => actions.askDelete(false)}>${t("cancel")}</button>
          </div>
        `
      : html`<button type="button" class="secondary danger" @click=${() => actions.askDelete(true)}>${t("accountDelete")}</button>`}
  `;
}

function publicationList(model: AccountViewModel, actions: AccountActions) {
  const { publications } = model;
  if (publications === null) return html`<p>${t("loading")}</p>`;
  if (publications.length === 0) return html`<p>${t("myPublicationsEmpty")}</p>`;
  const entries = publications.map((p) => ({
    id: p.id,
    href: `#/g/${p.id}`,
    title: p.title,
    description: p.description,
    hidden: p.hidden,
    sub: `${p.typeName} · ${t("myPublicationsStats", { date: date(p.publishedAt), plays: tn("galleryPlays", p.playCount), likes: tn("galleryLikes", p.likeCount) })}`,
    confirm: t("myPublicationsWithdrawConfirm", { title: p.title }),
  }));
  return ownList(model, entries, actions, { save: actions.savePublication, withdraw: actions.withdraw });
}

function chainList(model: AccountViewModel, actions: AccountActions) {
  const { chains } = model;
  if (chains === null) return html`<p>${t("loading")}</p>`;
  if (chains.length === 0) return html`<p>${t("myChainsEmpty")}</p>`;
  const entries = chains.map((c) => ({
    id: c.id,
    href: `#/c/${c.id}`,
    title: c.title,
    description: c.description,
    hidden: c.hidden,
    sub: t("myChainsStats", { date: date(c.publishedAt), steps: tn("chainSteps", c.stepCount), plays: tn("galleryPlays", c.playCount) }),
    confirm: t("myChainsWithdrawConfirm", { title: c.title }),
  }));
  return ownList(model, entries, actions, { save: actions.saveChain, withdraw: actions.withdrawChain });
}

const date = (iso: string) => new Date(iso).toLocaleDateString(locale());

type OwnEntry = { id: string; href: string; title: string; description: string; hidden: boolean; sub: string; confirm: string };

/** Own publications or chains: title and description can be edited, withdrawing deletes. */
function ownList(
  model: AccountViewModel,
  entries: OwnEntry[],
  actions: AccountActions,
  handlers: { save(id: string, title: string, description: string): Promise<boolean>; withdraw(id: string): void },
) {
  const { busy } = model;
  return html`<ul class="publication-list">
    ${entries.map((p) => html`<li class="publication">
        <h3><a href=${p.href}>${p.title}</a></h3>
        <p class="hint">
          ${p.sub} ${p.hidden ? html` · <strong>${t("myPublicationsHidden")}</strong>` : nothing}
        </p>
        ${model.editingPublication === p.id
          ? html`<form class="account-form" @submit=${onSubmit((f) => handlers.save(p.id, field(f, "title"), field(f, "description")))}>
              <label class="field">
                <span>${t("myPublicationsTitle")}</span>
                <input type="text" name="title" required maxlength=${PUBLISH.maxTitle} .value=${p.title} />
              </label>
              <label class="field">
                <span>${t("publishDescription")}</span>
                <textarea name="description" rows="3" maxlength=${PUBLISH.maxDescription} .value=${p.description}></textarea>
              </label>
              <div class="account-actions">
                <button type="submit" ?disabled=${busy}>${t("accountSave")}</button>
                <button type="button" class="secondary" @click=${() => actions.editPublication(null)}>${t("cancel")}</button>
              </div>
            </form>`
          : model.confirmWithdraw === p.id
            ? html`<p class="notice" role="alert">${p.confirm}</p>
                <div class="account-actions">
                  <button type="button" class="danger-button" ?disabled=${busy} @click=${() => handlers.withdraw(p.id)}>
                    ${t("myPublicationsWithdraw")}
                  </button>
                  <button type="button" class="secondary" @click=${() => actions.askWithdraw(null)}>${t("cancel")}</button>
                </div>`
            : html`<div class="account-actions">
                <button type="button" class="secondary" @click=${() => actions.editPublication(p.id)}>${t("myPublicationsEdit")}</button>
                <button type="button" class="secondary danger" @click=${() => actions.askWithdraw(p.id)}>${t("myPublicationsWithdraw")}</button>
              </div>`}
      </li>`)}
  </ul>`;
}

function emailField() {
  return html`<label class="field">
    <span>${t("accountEmail")}</span>
    <input type="email" name="email" required autocomplete="email" inputmode="email" maxlength="254" />
  </label>`;
}

function passwordField(autocomplete: "current-password" | "new-password", label: string) {
  const isNew = autocomplete === "new-password";
  return html`<label class="field">
    <span>${label}</span>
    <input type="password" name="password" required autocomplete=${autocomplete} minlength=${isNew ? PASSWORD_MIN : 1} maxlength="72" />
    ${isNew ? html`<span class="hint">${t("accountPasswordHint", { min: PASSWORD_MIN })}</span>` : nothing}
  </label>`;
}

function usernameField(value: string) {
  return html`<label class="field">
    <span>${t("accountUsername")}</span>
    <input
      type="text"
      name="username"
      required
      autocomplete="username"
      minlength=${USERNAME.min}
      maxlength=${USERNAME.max}
      .value=${value}
    />
    <span class="hint">${t("accountUsernameHint", { min: USERNAME.min, max: USERNAME.max })}</span>
  </label>`;
}
