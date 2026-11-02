import { ApiError, apiErrorText } from "./api.ts";
import type { Api } from "./api.ts";
import type { MessageKey } from "../i18n/t.ts";

export type Profile = { id: string; username: string; isModerator: boolean; banned: boolean };

export const USERNAME = { min: 3, max: 20 } as const;
export const PASSWORD_MIN = 8;
// Same rule as the check constraint in supabase/migrations/0001_init.sql: letters, digits, "_", ".", "-".
const USERNAME_CHARS = /^[\p{L}\p{N}_.-]+$/u;

export type UsernameProblem = "too-short" | "too-long" | "invalid-chars";

export function usernameProblem(name: string): UsernameProblem | null {
  const length = [...name].length;
  if (length < USERNAME.min) return "too-short";
  if (length > USERNAME.max) return "too-long";
  if (!USERNAME_CHARS.test(name)) return "invalid-chars";
  return null;
}

export async function fetchProfile(api: Api, userId: string): Promise<Profile | null> {
  const rows = await api.rest<{ id: string; username: string; is_moderator: boolean; banned: boolean }[]>("profiles", {
    query: { id: `eq.${userId}`, select: "id,username,is_moderator,banned" },
  });
  const row = rows[0];
  return row ? { id: row.id, username: row.username, isModerator: row.is_moderator, banned: row.banned } : null;
}

export function usernameAvailable(api: Api, name: string): Promise<boolean> {
  return api.rest<boolean>("rpc/username_available", { body: { name } });
}

export async function renameUser(api: Api, userId: string, username: string): Promise<void> {
  await api.rest("profiles", {
    method: "PATCH",
    query: { id: `eq.${userId}` },
    body: { username },
    headers: { Prefer: "return=minimal" },
  });
}

export async function deleteAccount(api: Api): Promise<void> {
  await api.rest("rpc/delete_account", { body: {} });
}

/** A user-facing text for errors of sign-up, sign-in and account changes. */
export function accountErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "invalid_credentials":
      case "invalid_grant":
        return "authInvalidCredentials";
      case "email_not_confirmed":
        return "authEmailNotConfirmed";
      case "user_already_exists":
      case "email_exists":
        return "authEmailTaken";
      case "weak_password":
        return "authWeakPassword";
      case "same_password":
        return "authSamePassword";
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return "apiRateLimited";
      case "otp_expired":
        return "authLinkExpired";
      case "23505": // unique username index
        return "usernameTaken";
      case "signup_disabled":
        return "authSignupDisabled";
    }
  }
  return apiErrorText(error);
}
