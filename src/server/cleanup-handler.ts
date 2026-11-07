// Request handler of the Edge Function "cleanup-images" (supabase/functions/cleanup-images/index.ts).
// Called once a day by .github/workflows/cleanup-images.yml with a shared secret.
// - quiz-images: deletes the folders of puzzles that no longer exist (withdrawn, deleted by moderators,
//   accounts deleted).
// - user-images (M27): deletes the folders of deleted accounts, and pictures that none of the account's synced
//   puzzles uses any more (only if older than a day, so a picture uploaded just before its puzzle stays).
import { loadDocument } from "../core/document.ts";
import { rulesRegistry } from "../puzzles/rules.ts";

export type CleanupEnv = {
  url: string;
  serviceKey: string;
  secret: string; // CLEANUP_SECRET; without it the function refuses to run
  fetch?: typeof fetch;
  now?: () => number;
};

const BUCKET = "quiz-images";
const USER_BUCKET = "user-images";
const PAGE = 1000;
const DOC_PAGE = 50;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

type Entry = { name: string; created_at?: string | null };

/** Picture keys of a synced document; null if it cannot be read (then the account's pictures all stay). */
export function imageKeysOf(doc: unknown): string[] | null {
  try {
    const { type, doc: checked } = loadDocument(doc, rulesRegistry, { draft: true });
    return type.imageKeys?.(checked.data) ?? [];
  } catch {
    return null;
  }
}

async function cleanup(env: CleanupEnv) {
  const doFetch = env.fetch ?? fetch;
  const headers = { ...serviceHeaders(env.serviceKey), "Content-Type": "application/json" };
  const now = env.now?.() ?? Date.now();

  async function list(bucket: string, prefix: string): Promise<Entry[]> {
    const entries: Entry[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const response = await doFetch(`${env.url}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!response.ok) throw new Error(`list ${bucket}/${prefix}: ${response.status}`);
      const page = (await response.json()) as Entry[];
      entries.push(...page);
      if (page.length < PAGE) return entries;
    }
  }

  async function remove(bucket: string, paths: string[]) {
    if (paths.length === 0) return;
    const response = await doFetch(`${env.url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!response.ok) throw new Error(`delete ${bucket}: ${response.status}`);
  }

  /** The ids among `ids` that still exist in `table`. */
  async function existing(table: string, ids: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const response = await doFetch(`${env.url}/rest/v1/${table}?select=id&id=in.(${chunk.join(",")})`, { headers });
      if (!response.ok) throw new Error(`${table}: ${response.status}`);
      for (const row of (await response.json()) as { id: string }[]) found.add(row.id);
    }
    return found;
  }

  /** Picture keys used by the account's synced puzzles; null if one document could not be read. */
  async function usedKeys(userId: string): Promise<Set<string> | null> {
    const keys = new Set<string>();
    for (let offset = 0; ; offset += DOC_PAGE) {
      const query = `select=doc&user_id=eq.${userId}&deleted=is.false&order=id&limit=${DOC_PAGE}&offset=${offset}`;
      const response = await doFetch(`${env.url}/rest/v1/sync_puzzles?${query}`, { headers });
      if (!response.ok) throw new Error(`sync_puzzles: ${response.status}`);
      const rows = (await response.json()) as { doc: unknown }[];
      for (const row of rows) {
        const found = imageKeysOf(row.doc);
        if (found === null) return null;
        for (const key of found) keys.add(key);
      }
      if (rows.length < DOC_PAGE) return keys;
    }
  }

  // Pictures of published puzzles.
  const folders = (await list(BUCKET, "")).map((e) => e.name).filter((name) => UUID.test(name));
  const puzzles = await existing("puzzles", folders);
  let files = 0;
  const orphans = folders.filter((folder) => !puzzles.has(folder));
  for (const folder of orphans) {
    const paths = (await list(BUCKET, folder)).map((e) => `${folder}/${e.name}`);
    await remove(BUCKET, paths);
    files += paths.length;
  }

  // Pictures of synced puzzles.
  const users = (await list(USER_BUCKET, "")).map((e) => e.name).filter((name) => UUID.test(name));
  const accounts = await existing("profiles", users);
  let userFiles = 0;
  let userFolders = 0;
  for (const user of users) {
    const entries = (await list(USER_BUCKET, user)).filter((e) => e.name !== ".emptyFolderPlaceholder");
    let unused: Entry[];
    if (!accounts.has(user)) {
      unused = entries;
      userFolders++;
    } else {
      const used = await usedKeys(user);
      if (used === null) continue;
      unused = entries.filter((e) => !used.has(e.name) && e.created_at && now - Date.parse(e.created_at) > MIN_AGE_MS);
    }
    await remove(USER_BUCKET, unused.map((e) => `${user}/${e.name}`));
    userFiles += unused.length;
  }

  return {
    folders: folders.length,
    removedFolders: orphans.length,
    removedFiles: files,
    userFolders: users.length,
    removedUserFolders: userFolders,
    removedUserFiles: userFiles,
  };
}
