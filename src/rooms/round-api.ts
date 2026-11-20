// Escape rooms (M47): rounds of playing together on the server. DOM-free; only types from the room logic.
// Starting, joining and events go through the Edge Function "round" (src/server/round-handler.ts); the state is read
// with round_state() (supabase/migrations/0017_rounds.sql), which is cheap enough to ask every few seconds.

import { ApiError, apiErrorText } from "../core/api.ts";
import type { Api } from "../core/api.ts";
import type { MessageKey } from "../i18n/t.ts";
import { parseRoundState } from "./group.ts";
import type { GroupEvent, RoundState } from "./group.ts";

/** What this device keeps per round (meta store, `round-session:<code>`): enough to come back after a reload. */
export type RoundSession = { code: string; token: string; round: string; room: string };

export const roundSessionKey = (code: string) => `round-session:${code}`;
/** The saved game of a round (scene, hints): separate from playing the room alone. */
export const roundSaveKey = (code: string) => `round:${code}`;
/** The name last used to join, offered next time. */
export const ROUND_NAME_KEY = "round-name";

export function parseRoundSession(raw: unknown, code: string): RoundSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { token, round, room } = raw as Record<string, unknown>;
  if (typeof token !== "string" || typeof round !== "string" || typeof room !== "string") return null;
  return { code, token, round, room };
}

export async function createRound(api: Api, room: string, name: string): Promise<{ round: string; code: string; token: string }> {
  return api.functions("round", { body: { action: "create", room, name } });
}

export async function joinRound(api: Api, code: string, name: string): Promise<{ round: string; room: string; token: string }> {
  return api.functions("round", { body: { action: "join", code, name } });
}

/** Returns the round's state after the events (its `shared` is checked by sharedFor). */
export async function sendRoundEvents(api: Api, token: string, events: readonly GroupEvent[]): Promise<{ shared: RoundState["shared"] }> {
  return api.functions("round", { body: { action: "events", token, events } });
}

/** Null if this player is no longer in the round (left, or the round was deleted). */
export async function fetchRoundState(api: Api, token: string, since: number): Promise<RoundState | null> {
  return parseRoundState(await api.rest<unknown>("rpc/round_state", { body: { token, since } }));
}

export async function leaveRound(api: Api, token: string): Promise<void> {
  await api.rest("rpc/round_leave", { body: { token } });
}

/** A user-facing text for errors of the round function. */
export function roundErrorText(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "not-found":
        return "groupNotFound";
      case "expired":
        return "groupExpired";
      case "full":
        return "groupFull";
      case "daily-limit":
        return "groupDailyLimit";
      case "too-many":
        return "groupTooMany";
      case "invalid-name":
        return "groupNameInvalid";
      case "banned":
        return "publishBanned";
    }
  }
  return apiErrorText(error);
}
