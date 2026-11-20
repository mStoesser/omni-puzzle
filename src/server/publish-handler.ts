import { PUBLISH, PublishError, prepareImages, preparePublication } from "../core/publish.ts";
import type { UploadImage } from "../core/publish.ts";
import { rulesRegistry } from "../puzzles/rules.ts";
import { ROOM_PUBLISH, isRoomRequest, prepareRoomImages, prepareRoomPublication } from "../rooms/publish.ts";
import type { RoomPublication } from "../rooms/publish.ts";

// Request handler of the Edge Function "publish" (supabase/functions/publish/index.ts). Runtime-neutral
// (Request/Response/fetch), so it is tested with node --test like the rest of the app.
// It publishes puzzles and, since M46, escape rooms (a document with kind "escape-room").

export type PublishEnv = {
  url: string; // project URL, e.g. https://<ref>.supabase.co
  serviceKey: string; // secret key (sb_secret_…) or legacy service_role JWT; never leaves the function
  fetch?: typeof fetch;
};

/** Error codes in the JSON body `{ error }`; the app maps them to texts. */
export type PublishFailure =
  | PublishError["code"]
  | "method"
  | "unauthorized"
  | "banned"
  | "daily-limit"
  | "duplicate"
  | "upload"
  | "server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // access is guarded by the user's token, not the origin
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** `message`: for escape rooms, the id of the embedded puzzle an error is about. */
function failure(status: number, error: PublishFailure, message?: string): Response {
  return json(status, message === undefined ? { error } : { error, message });
}

/** New secret keys go into `apikey` only; the legacy service_role JWT also needs to be the bearer token. */
function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

export async function handlePublish(request: Request, env: PublishEnv): Promise<Response> {
  try {
    return await handle(request, env);
  } catch (error) {
    console.error("publish failed", error);
    return failure(500, "server"); // with CORS headers, so the app sees the error
  }
}

async function handle(request: Request, env: PublishEnv): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return failure(405, "method");
  const doFetch = env.fetch ?? fetch;

  const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return failure(401, "unauthorized");

  const text = await request.text();
  if (text.length > Math.max(PUBLISH.maxRequestBytes, ROOM_PUBLISH.maxRequestBytes)) return failure(413, "too-large");

  // The user behind the token, checked by Supabase Auth (works with any signing key).
  const userResponse = await doFetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: serviceHeaders(env.serviceKey).apikey!, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return failure(401, "unauthorized");
  const user = (await userResponse.json()) as { id?: unknown };
  if (typeof user.id !== "string") return failure(401, "unauthorized");

  let insert: { table: "puzzles" | "rooms"; rpc: string; args: Record<string, unknown> };
  let images: UploadImage[];
  try {
    const input: unknown = JSON.parse(text);
    if (isRoomRequest(input)) {
      const room = prepareRoomPublication(input, rulesRegistry);
      images = prepareRoomImages(room, input, rulesRegistry);
      insert = { table: "rooms", rpc: "publish_room", args: roomArgs(user.id, room) };
    } else {
      if (text.length > PUBLISH.maxRequestBytes) return failure(413, "too-large");
      const publication = preparePublication(input, rulesRegistry);
      images = prepareImages(publication, input, rulesRegistry);
      insert = {
        table: "puzzles",
        rpc: "publish_puzzle",
        args: {
          author: user.id,
          type: publication.type,
          type_version: publication.typeVersion,
          doc: publication.doc,
          content_key: publication.contentKey,
          title: publication.title,
          description: publication.description,
          min_moves: publication.minMoves,
          difficulty: publication.difficulty,
          lang: publication.lang,
        },
      };
    }
  } catch (error) {
    if (error instanceof PublishError) {
      // The message names the embedded puzzle (rooms only); other messages are details for the log.
      const message = /^[A-Za-z0-9_-]{1,64}$/.test(error.message) && error.message !== error.code ? error.message : undefined;
      return failure(400, error.code, message);
    }
    if (error instanceof SyntaxError) return failure(400, "invalid-request");
    throw error;
  }

  const inserted = await doFetch(`${env.url}/rest/v1/rpc/${insert.rpc}`, {
    method: "POST",
    headers: { ...serviceHeaders(env.serviceKey), "Content-Type": "application/json" },
    body: JSON.stringify(insert.args),
  });
  if (inserted.ok) {
    const id = (await inserted.json()) as string;
    if (await uploadImages(id, images, env, doFetch)) return json(201, { id });
    // Without its pictures it is incomplete: take it back. Uploaded files are removed by cleanup-images.
    await doFetch(`${env.url}/rest/v1/${insert.table}?id=eq.${id}`, { method: "DELETE", headers: serviceHeaders(env.serviceKey) });
    return failure(502, "upload");
  }

  const body = (await inserted.json().catch(() => ({}))) as { code?: unknown };
  switch (body.code) {
    case "23505":
      return failure(409, "duplicate");
    case "PT403":
      return failure(403, "banned");
    case "PT429":
      return failure(429, "daily-limit");
  }
  console.error(`${insert.rpc} failed`, inserted.status, body);
  return failure(500, "server");
}

function roomArgs(author: string, room: RoomPublication): Record<string, unknown> {
  return {
    author,
    doc: room.doc,
    content_key: room.contentKey,
    title: room.title,
    description: room.description,
    lang: room.lang,
    cover: room.cover,
    scene_count: room.sceneCount,
    puzzle_count: room.puzzleCount,
    min_steps: room.minSteps,
  };
}

/** Uploads to quiz-images/<puzzle or room id>/<key>; false if any upload fails. */
async function uploadImages(puzzleId: string, images: UploadImage[], env: PublishEnv, doFetch: typeof fetch): Promise<boolean> {
  for (const image of images) {
    const response = await doFetch(`${env.url}/storage/v1/object/quiz-images/${puzzleId}/${image.key}`, {
      method: "POST",
      headers: { ...serviceHeaders(env.serviceKey), "Content-Type": image.type, "x-upsert": "true" },
      body: new Uint8Array(image.bytes), // copy with a plain ArrayBuffer, as fetch expects
    });
    if (!response.ok) {
      console.error("image upload failed", response.status, await response.text().catch(() => ""));
      return false;
    }
  }
  return true;
}
