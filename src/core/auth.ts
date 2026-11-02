import { ApiError, createApi } from "./api.ts";
import type { BackendConfig } from "./api.ts";

/** A signed-in user's session; `expiresAt` in seconds since the epoch like the JWT `exp`. */
export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
};

/** Minimal synchronous key-value store (localStorage in the browser). */
export type KeyValueStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

/** What an auth link (confirmation or password reset) brought back in the URL fragment. */
export type AuthCallback =
  | { kind: "signed-in"; type: string } // type: "signup", "recovery", "email_change", …
  | { kind: "error"; code: string };

export type Auth = {
  session(): Session | null;
  /** A valid access token, refreshed shortly before it expires; null when signed out. */
  accessToken(): Promise<string | null>;
  /** Without email confirmation the user is signed in right away (returns true). */
  signUp(email: string, password: string, username: string, redirectTo: string): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  /** Always ends signed out locally, even if the server cannot be reached. */
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Parses a fragment like "#access_token=…" or "#error=…"; null if it is no auth callback. */
  handleCallback(fragment: string): AuthCallback | null;
  /** Re-reads the stored session (another tab signed in or out). */
  reload(): void;
  /** Ends locally without a server call (e.g. after deleting the account). */
  forget(): void;
  subscribe(listener: (session: Session | null) => void): () => void;
};

export const SESSION_KEY = "raetsel-session";
const REFRESH_MARGIN_S = 60;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
};

export function createAuth(
  config: BackendConfig,
  options: { store: KeyValueStore; fetch?: typeof fetch; now?: () => number },
): Auth {
  const api = createApi(config, options.fetch ? { fetch: options.fetch } : {});
  const { store } = options;
  const nowSeconds = () => Math.floor((options.now ?? Date.now)() / 1000);
  const listeners = new Set<(session: Session | null) => void>();
  let current = readSession(store.get(SESSION_KEY));
  let refreshing: Promise<string | null> | null = null;

  function set(session: Session | null) {
    current = session;
    if (session) store.set(SESSION_KEY, JSON.stringify(session));
    else store.remove(SESSION_KEY);
    for (const listener of listeners) listener(session);
  }

  function fromTokens(response: TokenResponse): Session {
    const session = sessionFromTokens(response, nowSeconds());
    if (!session) throw new ApiError("server", 0, "incomplete token response");
    return session;
  }

  async function refresh(session: Session): Promise<string | null> {
    try {
      const response = await api.auth<TokenResponse>("token", {
        query: { grant_type: "refresh_token" },
        body: { refresh_token: session.refreshToken },
      });
      const next = fromTokens(response);
      if (current?.refreshToken === session.refreshToken) set(next);
      return next.accessToken;
    } catch (error) {
      // A rejected refresh token means the session is gone (signed out elsewhere, account deleted).
      if (error instanceof ApiError && (error.kind === "invalid" || error.kind === "unauthorized" || error.kind === "forbidden")) {
        if (current?.refreshToken === session.refreshToken) set(null);
        return null;
      }
      throw error;
    }
  }

  function accessToken(): Promise<string | null> {
    const session = current;
    if (!session) return Promise.resolve(null);
    if (session.expiresAt - REFRESH_MARGIN_S > nowSeconds()) return Promise.resolve(session.accessToken);
    refreshing ??= refresh(session).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  return {
    session: () => current,

    accessToken,

    async signUp(email, password, username, redirectTo) {
      const response = await api.auth<TokenResponse>("signup", {
        query: { redirect_to: redirectTo },
        body: { email, password, data: { username } },
      });
      if (!response?.access_token) return false;
      set(fromTokens(response));
      return true;
    },

    async signIn(email, password) {
      const response = await api.auth<TokenResponse>("token", {
        query: { grant_type: "password" },
        body: { email, password },
      });
      set(fromTokens(response));
    },

    async signOut() {
      const session = current;
      set(null);
      if (!session) return;
      try {
        await api.auth("logout", { method: "POST", headers: bearer(session.accessToken) });
      } catch (error) {
        console.warn("sign-out on the server failed", error);
      }
    },

    async requestPasswordReset(email, redirectTo) {
      await api.auth("recover", { query: { redirect_to: redirectTo }, body: { email } });
    },

    async updatePassword(password) {
      const token = await accessToken();
      if (!token) throw new ApiError("unauthorized", 401);
      await api.auth("user", { method: "PUT", headers: bearer(token), body: { password } });
    },

    handleCallback(fragment) {
      const params = new URLSearchParams(fragment.replace(/^#/, ""));
      if (params.has("error") || params.has("error_code")) {
        return { kind: "error", code: params.get("error_code") ?? params.get("error") ?? "unknown" };
      }
      if (!params.has("access_token")) return null;
      const session = sessionFromTokens(
        {
          access_token: params.get("access_token") ?? undefined,
          refresh_token: params.get("refresh_token") ?? undefined,
          expires_at: Number(params.get("expires_at")) || undefined,
          expires_in: Number(params.get("expires_in")) || undefined,
        },
        nowSeconds(),
      );
      if (!session) return { kind: "error", code: "invalid_callback" };
      set(session);
      return { kind: "signed-in", type: params.get("type") ?? "" };
    },

    reload() {
      const stored = readSession(store.get(SESSION_KEY));
      if (stored?.accessToken !== current?.accessToken) {
        current = stored;
        for (const listener of listeners) listener(stored);
      }
    },

    forget: () => set(null),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Builds a session from a token response; the user comes from the response or the JWT claims. */
export function sessionFromTokens(response: TokenResponse, now: number): Session | null {
  const { access_token: accessToken, refresh_token: refreshToken } = response;
  if (!accessToken || !refreshToken) return null;
  const claims = jwtClaims(accessToken);
  const id = response.user?.id ?? claims?.sub;
  const email = response.user?.email ?? claims?.email ?? "";
  const expiresAt = response.expires_at ?? (response.expires_in ? now + response.expires_in : claims?.exp);
  if (typeof id !== "string" || typeof expiresAt !== "number") return null;
  return { accessToken, refreshToken, expiresAt, user: { id, email: typeof email === "string" ? email : "" } };
}

/** Reads the payload of a JWT without verifying it (the server verifies). */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof claims === "object" && claims !== null ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readSession(json: string | null): Session | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<Session>;
    if (
      typeof value.accessToken === "string" &&
      typeof value.refreshToken === "string" &&
      typeof value.expiresAt === "number" &&
      typeof value.user?.id === "string"
    ) {
      return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt, user: { id: value.user.id, email: String(value.user.email ?? "") } };
    }
  } catch {
    // ignore broken entries
  }
  return null;
}
