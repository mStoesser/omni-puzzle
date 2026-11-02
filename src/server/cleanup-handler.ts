// Request handler of the Edge Function "cleanup-images" (supabase/functions/cleanup-images/index.ts).
// Deletes the image folders of puzzles that no longer exist (withdrawn, deleted by moderators, accounts
// deleted). Called once a day by .github/workflows/cleanup-images.yml with a shared secret.

export type CleanupEnv = {
  url: string;
  serviceKey: string;
  secret: string; // CLEANUP_SECRET; without it the function refuses to run
  fetch?: typeof fetch;
};

const BUCKET = "quiz-images";
const PAGE = 1000;
const PUZZLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

/** Constant-time comparison, so the secret cannot be guessed from response times. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleCleanup(request: Request, env: CleanupEnv): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "method" }, { status: 405 });
  const given = request.headers.get("x-cleanup-secret") ?? "";
  if (env.secret === "" || !sameSecret(given, env.secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await cleanup(env));
  } catch (error) {
    console.error("cleanup failed", error);
    return Response.json({ error: "server" }, { status: 500 });
  }
}

async function cleanup(env: CleanupEnv) {
  const doFetch = env.fetch ?? fetch;
  const headers = { ...serviceHeaders(env.serviceKey), "Content-Type": "application/json" };

  async function list(prefix: string): Promise<string[]> {
    const names: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const response = await doFetch(`${env.url}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) throw new Error(`list ${prefix}: ${response.status}`);
      const page = (await response.json()) as { name: string }[];
      names.push(...page.map((entry) => entry.name));
      if (page.length < PAGE) return names;
    }
  }

  const folders = (await list("")).filter((name) => PUZZLE_ID.test(name));
  const existing = new Set<string>();
  for (let i = 0; i < folders.length; i += 100) {
    const chunk = folders.slice(i, i + 100);
    const response = await doFetch(`${env.url}/rest/v1/puzzles?select=id&id=in.(${chunk.join(",")})`, { headers });
    if (!response.ok) throw new Error(`puzzles: ${response.status}`);
    for (const row of (await response.json()) as { id: string }[]) existing.add(row.id);
  }

  let files = 0;
  const orphans = folders.filter((folder) => !existing.has(folder));
  for (const folder of orphans) {
    const paths = (await list(folder)).map((name) => `${folder}/${name}`);
    if (paths.length === 0) continue;
    const response = await doFetch(`${env.url}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!response.ok) throw new Error(`delete ${folder}: ${response.status}`);
    files += paths.length;
  }
  return { folders: folders.length, removedFolders: orphans.length, removedFiles: files };
}
