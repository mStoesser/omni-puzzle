import { PUBLISH, PublishError, preparePublication } from "../core/publish.ts";
import { rulesRegistry } from "../puzzles/rules.ts";

// Request handler of the Edge Function "publish" (supabase/functions/publish/index.ts). Runtime-neutral
// (Request/Response/fetch), so it is tested with node --test like the rest of the app.

export type PublishEnv = {
  url: string; // project URL, e.g. https://<ref>.supabase.co
  serviceKey: string; // secret key (sb_secret_…) or legacy service_role JWT; never leaves the function
  fetch?: typeof fetch;
};

/** Error codes in the JSON body `{ error }`; the app maps them to texts. */
export type PublishFailure = PublishError["code"] | "method" | "unauthorized" | "banned" | "daily-limit" | "duplicate" | "server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // access is guarded by the user's token, not the origin
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function failure(status: number, error: PublishFailure): Response {
  return json(status, { error });
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
  if (text.length > PUBLISH.maxDocBytes * 2) return failure(413, "too-large");

  // The user behind the token, checked by Supabase Auth (works with any signing key).
  const userResponse = await doFetch(`${env.url}/auth/v1/user`, {
    headers: { apikey: serviceHeaders(env.serviceKey).apikey!, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return failure(401, "unauthorized");
  const user = (await userResponse.json()) as { id?: unknown };
  if (typeof user.id !== "string") return failure(401, "unauthorized");

  let publication;
  try {
    publication = preparePublication(JSON.parse(text), rulesRegistry);
  } catch (error) {
    if (error instanceof PublishError) return failure(400, error.code);
    if (error instanceof SyntaxError) return failure(400, "invalid-request");
    throw error;
  }

  const insert = await doFetch(`${env.url}/rest/v1/rpc/publish_puzzle`, {
    method: "POST",
    headers: { ...serviceHeaders(env.serviceKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      author: user.id,
      type: publication.type,
      type_version: publication.typeVersion,
      doc: publication.doc,
      content_key: publication.contentKey,
      title: publication.title,
      description: publication.description,
      min_moves: publication.minMoves,
      difficulty: publication.difficulty,
    }),
  });
  if (insert.ok) return json(201, { id: await insert.json() });

  const body = (await insert.json().catch(() => ({}))) as { code?: unknown };
  switch (body.code) {
    case "23505":
      return failure(409, "duplicate");
    case "PT403":
      return failure(403, "banned");
    case "PT429":
      return failure(429, "daily-limit");
  }
  console.error("publish_puzzle failed", insert.status, body);
  return failure(500, "server");
}
