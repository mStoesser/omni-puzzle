import { html, nothing } from "lit-html";
import { PASSWORD_MIN, USERNAME } from "../../core/account.ts";
import type { Profile } from "../../core/account.ts";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/t.ts";

export type AccountMode = "signIn" | "signUp" | "reset" | "newPassword";

export type AccountMessage = { tone: "ok" | "error"; text: MessageKey };

export type AccountViewModel = {
  user: { id: string; email: string } | null; // null = signed out
  profile: Profile | null; // null while loading or if missing
  mode: AccountMode;
  busy: boolean;
  message: AccountMessage | null;
  confirmDelete: boolean;
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
};

const TITLE: Record<AccountMode, MessageKey> = {
  signIn: "accountSignIn",
  signUp: "accountSignUp",
  reset: "accountReset",
  newPassword: "accountNewPassword",
};

export function accountView(model: AccountViewModel, actions: AccountActions) {
  const signedIn = model.user !== null && model.mode !== "newPassword";
  return html`
    <header class="toolbar">
      <a class="button secondary" href="#/" aria-label=${t("back")}>←</a>
      <h1 class="toolbar-title">${signedIn ? t("account") : t(TITLE[model.mode])}</h1>
    </header>
    ${model.message
      ? html`<p class=${model.message.tone === "ok" ? "account-ok" : "notice"} role=${model.message.tone === "ok" ? "status" : "alert"}>
          ${t(model.message.text)}
        </p>`
      : nothing}
    ${signedIn ? profileSection(model, actions) : authForm(model, actions)}
  `;
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
