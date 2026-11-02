import type { MessageKey } from "../i18n/t.ts";

/** A Supabase project. `key` is the public publishable key; access is guarded by Row Level Security. */
export type BackendConfig = { readonly url: string; readonly key: string };

/** Accepts `https://<ref>.supabase.co` (or a local `http://localhost:<port>` stack) and a non-empty key. */
export function backendConfig(url: unknown, key: unknown): BackendConfig | null {
  if (typeof url !== "string" || typeof key !== "string" || key.trim() === "") return null;
  const clean = url.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(clean) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(clean)) {
    return null;
  }
  return { url: clean, key: key.trim() };
}

export type ApiErrorKind =
  | "offline" // no response at all
  | "timeout"
  | "unauthorized" // missing or expired session
  | "forbidden" // signed in, but not allowed
  | "not-found"
  | "conflict" // e.g. unique violation
  | "rate-limited"
  | "invalid" // rejected input
  | "server";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number; // 0 without a response
  readonly code: string | undefined; // backend code, e.g. Postgres "23505" or Auth "email_exists"

  constructor(kind: ApiErrorKind, status: number, message?: string, code?: string) {
    super(message ?? kind);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export type ApiRequest = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Readonly<Record<string, string>>;
  body?: unknown; // sent as JSON
  headers?: Readonly<Record<string, string>>; // e.g. PostgREST "Prefer"
};

export type Api = {
  /** PostgREST: `rest("puzzles", { query: { select: "id" } })` → GET /rest/v1/puzzles?select=id */
  rest<T>(path: string, request?: ApiRequest): Promise<T>;
  /** Supabase Auth: /auth/v1/<path> */
  auth<T>(path: string, request?: ApiRequest): Promise<T>;
  /** Edge Functions: /functions/v1/<name> */
  functions<T>(name: string, request?: ApiRequest): Promise<T>;
};

export type ApiOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** The signed-in user's access token, if any; may refresh it first. Without it requests run as the anonymous role. */
  accessToken?: () => string | null | Promise<string | null>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createApi(config: BackendConfig, options: ApiOptions = {}): Api {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send<T>(base: string, path: string, request: ApiRequest = {}): Promise<T> {
    const url = new URL(`${config.url}/${base}/${path.replace(/^\/+/, "")}`);
    for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);

    // The publishable key goes into `apikey` only; `Authorization` carries a user JWT or nothing.
    const headers: Record<string, string> = { apikey: config.key, ...request.headers };
    const token = await options.accessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (request.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      response = await doFetch(url, {
        method: request.method ?? (request.body === undefined ? "GET" : "POST"),
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new ApiError("timeout", 0);
      }
      throw new ApiError("offline", 0, error instanceof Error ? error.message : undefined);
    }

    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) throw errorFromResponse(response.status, body);
    return (text === "" ? undefined : body) as T;
  }

  return {
    rest: (path, request) => send("rest/v1", path, request),
    auth: (path, request) => send("auth/v1", path, request),
    functions: (name, request) => send("functions/v1", name, request),
  };
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Maps an error response of PostgREST, Auth or a function to an ApiError. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  // PostgREST: { code, message }; Auth: { error_code, msg } or { error, error_description }; functions: { error }.
  const code = firstString(fields.error_code, fields.code, fields.error);
  const message = firstString(fields.message, fields.msg, fields.error_description, fields.error, typeof body === "string" ? body : undefined);
  return new ApiError(kindOf(status, code), status, message, code);
}

function kindOf(status: number, code: string | undefined): ApiErrorKind {
  if (code === "23505") return "conflict"; // Postgres unique violation
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server";
  return "invalid";
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value !== "") return value;
  return undefined;
}

/** A user-facing text for any error thrown by the API. */
export function apiErrorText(error: unknown): MessageKey {
  if (!(error instanceof ApiError)) return "apiServer";
  switch (error.kind) {
    case "offline":
      return "apiOffline";
    case "timeout":
      return "apiTimeout";
    case "unauthorized":
      return "apiUnauthorized";
    case "forbidden":
      return "apiForbidden";
    case "not-found":
      return "apiNotFound";
    case "conflict":
      return "apiConflict";
    case "rate-limited":
      return "apiRateLimited";
    case "invalid":
      return "apiInvalid";
    case "server":
      return "apiServer";
  }
}
