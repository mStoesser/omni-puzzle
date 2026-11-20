import { sha256Hex } from "../core/hash.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { GROUP, applyGroupEvents, cleanPlayerName, isPlayerToken, isRoundCode, newPlayerToken, newRoundCode, parseGroupEvents, sharedFor } from "../rooms/group.ts";
import { loadEscapeRoom } from "../rooms/logic.ts";

// Request handler of the Edge Function "round" (supabase/functions/round/index.ts): playing an escape room together
// (M47). Runtime-neutral like publish-handler.ts. Three actions:
// - "create": a signed-in user starts a round of a published room and gets its code and their player token.
// - "join": anyone with the code joins under a name and gets a player token (no account).
// - "events": a player reports what they solved; the events are replayed on the round's state and the room's document
//   (src/rooms/group.ts), what holds is merged in (round_merge() in supabase/migrations/0017_rounds.sql).
// Reading the round's state needs no function: the app calls round_state() with its token.

export type RoundEnv = {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
  random?: (n: number) => Uint8Array; // for tests; crypto.getRandomValues otherwise
};

/** Error codes in the JSON body `{ error }`; the app maps them to texts (roundErrorText). */
export type RoundFailure =
  | "method"
  | "invalid-request"
  | "invalid-name"
  | "unauthorized"
  | "too-large"
  | "not-found" // no such room, round or player
  | "expired" // the round is over (24 hours)
  | "full"
  | "daily-limit"
  | "too-many" // events per round
  | "banned"
  | "server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // access is guarded by tokens, not the origin
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE_ATTEMPTS = 5;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function failure(status: number, error: RoundFailure): Response {
  return json(status, { error });
}

function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleRound(request: Request, env: RoundEnv): Promise<Response> {
  try {
    return await handle(request, env);
  } catch (error) {
    console.error("round failed", error);
    return failure(500, "server");
  }
}

/** Postgres errors raised by the round functions (errcode PTxxx) and what they mean here. */
const RPC_FAILURES: Record<string, [number, RoundFailure]> = {
  PT403: [403, "banned"],
  PT404: [404, "not-found"],
  PT409: [409, "full"],
  PT410: [410, "expired"],
  PT429: [429, "daily-limit"],
};

async function handle(request: Request, env: RoundEnv): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return failure(405, "method");
  const doFetch = env.fetch ?? fetch;
  const service = serviceHeaders(env.serviceKey);
  const random = env.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));

  const text = await request.text();
  if (text.length > GROUP.maxRequestBytes) return failure(413, "too-large");
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return failure(400, "invalid-request");
  }
  if (!isRecord(input)) return failure(400, "invalid-request");

  /** Calls a round function; a Response for the errors it raises on purpose. */
  const rpc = async (name: string, body: Record<string, unknown>): Promise<{ value: unknown } | Response | { code: string }> => {
    const response = await doFetch(`${env.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { value: await response.json() };
    const error = (await response.json().catch(() => ({}))) as { code?: unknown };
    if (error.code === "23505") return { code: "23505" };
    const known = typeof error.code === "string" ? RPC_FAILURES[error.code] : undefined;
    if (known) return failure(...known);
    throw new Error(`${name} failed: ${response.status} ${JSON.stringify(error)}`);
  };

  switch (input.action) {
    case "create": {
      const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
      if (!token) return failure(401, "unauthorized");
      const userResponse = await doFetch(`${env.url}/auth/v1/user`, { headers: { apikey: service.apikey!, Authorization: `Bearer ${token}` } });
      if (!userResponse.ok) return failure(401, "unauthorized");
      const user = (await userResponse.json()) as { id?: unknown };
      if (typeof user.id !== "string") return failure(401, "unauthorized");
      if (typeof input.room !== "string" || !UUID.test(input.room)) return failure(400, "invalid-request");
      const name = cleanPlayerName(input.name);
      if (!name) return failure(400, "invalid-name");
      const playerToken = newPlayerToken(random);
      for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
        const code = newRoundCode(random);
        const result = await rpc("round_create", { host: user.id, room: input.room, round_code: code, token_hash: sha256Hex(playerToken), player_name: name });
        if (result instanceof Response) return result;
        if ("code" in result) continue; // the code is taken
        return json(200, { round: result.value, code, token: playerToken });
      }
      throw new Error("no free round code");
    }

    case "join": {
      if (!isRoundCode(input.code)) return failure(400, "invalid-request");
      const name = cleanPlayerName(input.name);
      if (!name) return failure(400, "invalid-name");
      const playerToken = newPlayerToken(random);
      const result = await rpc("round_join", { round_code: input.code, token_hash: sha256Hex(playerToken), player_name: name });
      if (result instanceof Response) return result;
      if ("code" in result) throw new Error("token collision"); // 2^256
      const joined = result.value as { round?: unknown; room?: unknown };
      return json(200, { round: joined.round, room: joined.room, token: playerToken });
    }

    case "events": {
      if (!isPlayerToken(input.token)) return failure(400, "invalid-request");
      const events = parseGroupEvents(input.events);
      if (!events) return failure(400, "invalid-request");
      const found = await rpc("round_of_player", { token_hash: sha256Hex(input.token) });
      if (found instanceof Response) return found;
      if ("code" in found) throw new Error("unexpected unique violation");
      const round = found.value as { player?: unknown; room?: unknown; expired?: unknown; flags: unknown; solved: unknown; opened: unknown; won: unknown } | null;
      if (!round || typeof round.player !== "string" || typeof round.room !== "string") return failure(404, "not-found");
      if (round.expired === true) return failure(410, "expired");

      const roomResponse = await doFetch(`${env.url}/rest/v1/rooms?id=eq.${round.room}&select=doc`, { headers: service });
      if (!roomResponse.ok) throw new Error(`room lookup ${roomResponse.status}`);
      const row = ((await roomResponse.json()) as { doc: unknown }[])[0];
      if (!row) return failure(404, "not-found");
      // A published room always loaded when it was published; failing now means this function is outdated (throws).
      const { data } = loadEscapeRoom(row.doc, rulesRegistry);
      const before = sharedFor(data, round);
      const after = applyGroupEvents(data, before, events);
      const merged = await rpc("round_merge", {
        player: round.player,
        add_flags: after.shared.flags,
        add_solved: after.shared.solved,
        add_opened: after.shared.opened,
        add_won: after.shared.won,
        add_news: after.news,
        event_total: events.length,
      });
      if (merged instanceof Response) {
        // round_merge raises PT429 only for too many events in the round.
        return merged.status === 429 ? failure(429, "too-many") : merged;
      }
      if ("code" in merged) throw new Error("unexpected unique violation");
      return json(200, { shared: merged.value, refused: after.refused });
    }
  }
  return failure(400, "invalid-request");
}
