import { DocumentError, loadDocument } from "../core/document.ts";
import { SCORE, ScoreError, checkSolution, parseScoreRequest } from "../core/scores.ts";
import { rulesRegistry } from "../puzzles/rules.ts";

// Request handler of the Edge Function "submit-score" (supabase/functions/submit-score/index.ts), runtime-neutral like
// publish-handler.ts. It replays the moves of a solution on the published puzzle, counts them itself and stores the
// result via submit_score() (supabase/migrations/0010_scores.sql). The time is only checked for plausibility.

export type ScoreEnv = {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
};

/** Error codes in the JSON body `{ error }`; the app maps them to texts (scoreErrorText). */
export type ScoreFailure =
  | ScoreError["code"]
  | "method"
  | "unauthorized"
  | "too-large"
  | "not-found" // unknown or hidden puzzle
  | "own" // authors do not enter their own leaderboards
  | "no-ranking" // the type has no leaderboard (quiz)
  | "banned"
  | "server";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // access is guarded by the user's token, not the origin
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function failure(status: number, error: ScoreFailure): Response {
  return json(status, { error });
}

function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

export async function handleScore(request: Request, env: ScoreEnv): Promise<Response> {
  try {
    return await handle(request, env);
  } catch (error) {
    console.error("submit-score failed", error);
    return failure(500, "server");
  }
}

type PuzzleRow = { type: string; doc: unknown; author_id: string; hidden: boolean };

async function handle(request: Request, env: ScoreEnv): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return failure(405, "method");
  const doFetch = env.fetch ?? fetch;
  const service = serviceHeaders(env.serviceKey);

  const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return failure(401, "unauthorized");
  const text = await request.text();
  if (text.length > SCORE.maxRequestBytes) return failure(413, "too-large");

  const userResponse = await doFetch(`${env.url}/auth/v1/user`, { headers: { apikey: service.apikey!, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return failure(401, "unauthorized");
  const user = (await userResponse.json()) as { id?: unknown };
  if (typeof user.id !== "string") return failure(401, "unauthorized");

  let score;
  try {
    score = parseScoreRequest(JSON.parse(text));
  } catch (error) {
    if (error instanceof ScoreError) return failure(400, error.code);
    if (error instanceof SyntaxError) return failure(400, "invalid-request");
    throw error;
  }

  const puzzleResponse = await doFetch(
    `${env.url}/rest/v1/puzzles?id=eq.${score.puzzle}&select=type,doc,author_id,hidden`,
    { headers: service },
  );
  if (!puzzleResponse.ok) throw new Error(`puzzle lookup ${puzzleResponse.status}`);
  const puzzle = ((await puzzleResponse.json()) as PuzzleRow[])[0];
  if (!puzzle || puzzle.hidden) return failure(404, "not-found");
  if (puzzle.author_id === user.id) return failure(403, "own");

  let loaded;
  try {
    loaded = loadDocument(puzzle.doc, rulesRegistry);
  } catch (error) {
    // A published document always loaded when it was published; failing now means this function is outdated.
    if (error instanceof DocumentError) throw new Error(`published puzzle does not load: ${error.message}`);
    throw error;
  }
  const { type, doc } = loaded;
  if (!type.ranking) return failure(400, "no-ranking");

  let moves: number;
  try {
    moves = checkSolution(type, doc.data, score.moves);
  } catch (error) {
    if (error instanceof ScoreError) return failure(400, error.code);
    throw error;
  }

  const insert = await doFetch(`${env.url}/rest/v1/rpc/submit_score`, {
    method: "POST",
    headers: { ...service, "Content-Type": "application/json" },
    body: JSON.stringify({
      player: user.id,
      puzzle: score.puzzle,
      move_count: type.ranking === "moves" ? moves : null, // ranked by time only: moves say nothing
      duration_ms: score.timeMs,
    }),
  });
  if (insert.ok) return json(200, { improved: (await insert.json()) === true });
  const body = (await insert.json().catch(() => ({}))) as { code?: unknown };
  if (body.code === "PT403") return failure(403, "banned");
  console.error("submit_score failed", insert.status, body);
  return failure(500, "server");
}
