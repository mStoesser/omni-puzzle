import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./api.ts";
import { SESSION_KEY, createAuth, jwtClaims, sessionFromTokens } from "./auth.ts";
import type { KeyValueStore, Session } from "./auth.ts";

const CONFIG = { url: "https://abc123.supabase.co", key: "sb_publishable_test" };
const NOW_S = 1_800_000_000;

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

/** base64url without padding, like a real JWT segment. */
function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function jwt(claims: Record<string, unknown>) {
  return `${b64url({ alg: "HS256" })}.${b64url(claims)}.signature`;
}

type Call = { url: string; init: RequestInit };
type Reply = { status: number; body?: unknown };

/** Answers calls in order; records them. */
function scriptedFetch(replies: Reply[], calls: Call[] = []): typeof fetch {
  return (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift() ?? { status: 500 };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
}

function tokens(access: string, refresh: string, expiresAt = NOW_S + 3600) {
  return { access_token: access, refresh_token: refresh, expires_at: expiresAt, expires_in: 3600, user: { id: "u1", email: "a@b.de" } };
}

const SESSION: Session = { accessToken: "old", refreshToken: "r1", expiresAt: NOW_S + 3600, user: { id: "u1", email: "a@b.de" } };

test("signIn stores the session and notifies", async () => {
  const store = memoryStore();
  const calls: Call[] = [];
  const auth = createAuth(CONFIG, { store, fetch: scriptedFetch([{ status: 200, body: tokens("a1", "r1") }], calls), now: () => NOW_S * 1000 });
  const seen: (Session | null)[] = [];
  auth.subscribe((s) => seen.push(s));
  await auth.signIn("a@b.de", "geheim123");
  assert.equal(calls[0]!.url, "https://abc123.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(calls[0]!.init.body, '{"email":"a@b.de","password":"geheim123"}');
  assert.equal(auth.session()?.user.id, "u1");
  assert.equal(seen.length, 1);
  assert.equal(JSON.parse(store.data.get(SESSION_KEY)!).accessToken, "a1");
  assert.equal(await auth.accessToken(), "a1");
});

test("a stored session survives a reload of the app", () => {
  const auth = createAuth(CONFIG, { store: memoryStore({ [SESSION_KEY]: JSON.stringify(SESSION) }), fetch: scriptedFetch([]) });
  assert.deepEqual(auth.session(), SESSION);
  const broken = createAuth(CONFIG, { store: memoryStore({ [SESSION_KEY]: "{nope" }), fetch: scriptedFetch([]) });
  assert.equal(broken.session(), null);
});

test("signUp sends the username and the redirect; with confirmation there is no session", async () => {
  const calls: Call[] = [];
  const auth = createAuth(CONFIG, { store: memoryStore(), fetch: scriptedFetch([{ status: 200, body: { id: "u1", email: "a@b.de" } }], calls) });
  assert.equal(await auth.signUp("a@b.de", "geheim123", "Rätselfan", "https://x.github.io/app/"), false);
  assert.equal(calls[0]!.url, "https://abc123.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fx.github.io%2Fapp%2F");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { email: "a@b.de", password: "geheim123", data: { username: "Rätselfan" } });
  assert.equal(auth.session(), null);
});

test("signUp without confirmation signs in", async () => {
  const auth = createAuth(CONFIG, { store: memoryStore(), fetch: scriptedFetch([{ status: 200, body: tokens("a1", "r1") }]), now: () => NOW_S * 1000 });
  assert.equal(await auth.signUp("a@b.de", "geheim123", "fan", "https://x/"), true);
  assert.equal(auth.session()?.accessToken, "a1");
});

test("an expiring token is refreshed once, even for parallel requests", async () => {
  const calls: Call[] = [];
  const store = memoryStore({ [SESSION_KEY]: JSON.stringify({ ...SESSION, expiresAt: NOW_S + 30 }) });
  const auth = createAuth(CONFIG, { store, fetch: scriptedFetch([{ status: 200, body: tokens("a2", "r2") }], calls), now: () => NOW_S * 1000 });
  const [first, second] = await Promise.all([auth.accessToken(), auth.accessToken()]);
  assert.equal(first, "a2");
  assert.equal(second, "a2");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://abc123.supabase.co/auth/v1/token?grant_type=refresh_token");
  assert.equal(calls[0]!.init.body, '{"refresh_token":"r1"}');
  assert.equal(auth.session()?.refreshToken, "r2");
});

test("a rejected refresh token signs out; a network error keeps the session", async () => {
  const expired = JSON.stringify({ ...SESSION, expiresAt: NOW_S - 10 });
  const rejected = createAuth(CONFIG, {
    store: memoryStore({ [SESSION_KEY]: expired }),
    fetch: scriptedFetch([{ status: 400, body: { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" } }]),
    now: () => NOW_S * 1000,
  });
  assert.equal(await rejected.accessToken(), null);
  assert.equal(rejected.session(), null);

  const offline = createAuth(CONFIG, {
    store: memoryStore({ [SESSION_KEY]: expired }),
    fetch: (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch,
    now: () => NOW_S * 1000,
  });
  await assert.rejects(offline.accessToken(), (e) => e instanceof ApiError && e.kind === "offline");
  assert.notEqual(offline.session(), null);
});

test("signOut ends locally even when the server fails", async () => {
  const store = memoryStore({ [SESSION_KEY]: JSON.stringify(SESSION) });
  const calls: Call[] = [];
  const auth = createAuth(CONFIG, { store, fetch: scriptedFetch([{ status: 500 }], calls) });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await auth.signOut();
  } finally {
    console.warn = warn;
  }
  assert.equal(auth.session(), null);
  assert.equal(store.data.has(SESSION_KEY), false);
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer old");
});

test("password reset and update", async () => {
  const calls: Call[] = [];
  const auth = createAuth(CONFIG, {
    store: memoryStore({ [SESSION_KEY]: JSON.stringify(SESSION) }),
    fetch: scriptedFetch([{ status: 200, body: {} }, { status: 200, body: { id: "u1" } }], calls),
    now: () => NOW_S * 1000,
  });
  await auth.requestPasswordReset("a@b.de", "https://x/");
  await auth.updatePassword("neues-passwort");
  assert.equal(calls[0]!.url, "https://abc123.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fx%2F");
  assert.equal(calls[1]!.init.method, "PUT");
  assert.equal((calls[1]!.init.headers as Record<string, string>).Authorization, "Bearer old");
  const signedOut = createAuth(CONFIG, { store: memoryStore(), fetch: scriptedFetch([]) });
  await assert.rejects(signedOut.updatePassword("x"), (e) => e instanceof ApiError && e.kind === "unauthorized");
});

test("handleCallback reads tokens and errors from the fragment", () => {
  const auth = createAuth(CONFIG, { store: memoryStore(), fetch: scriptedFetch([]), now: () => NOW_S * 1000 });
  const access = jwt({ sub: "u9", email: "neu@b.de", exp: NOW_S + 3600 });
  const result = auth.handleCallback(`#access_token=${access}&expires_at=${NOW_S + 3600}&expires_in=3600&refresh_token=r9&token_type=bearer&type=signup`);
  assert.deepEqual(result, { kind: "signed-in", type: "signup" });
  assert.deepEqual(auth.session()?.user, { id: "u9", email: "neu@b.de" });

  assert.deepEqual(auth.handleCallback("#error=access_denied&error_code=otp_expired&error_description=Email+link+expired"), {
    kind: "error",
    code: "otp_expired",
  });
  assert.equal(auth.handleCallback("#/play/abc"), null);
  assert.deepEqual(auth.handleCallback("#access_token=x&refresh_token=y"), { kind: "error", code: "invalid_callback" });
});

test("reload picks up a session changed in another tab", () => {
  const store = memoryStore();
  const auth = createAuth(CONFIG, { store, fetch: scriptedFetch([]) });
  const seen: (Session | null)[] = [];
  auth.subscribe((s) => seen.push(s));
  store.set(SESSION_KEY, JSON.stringify(SESSION));
  auth.reload();
  auth.reload(); // unchanged: no second notification
  assert.equal(auth.session()?.user.id, "u1");
  assert.equal(seen.length, 1);
});

test("jwtClaims and sessionFromTokens", () => {
  assert.deepEqual(jwtClaims(jwt({ sub: "u1", name: "Jörg" })), { sub: "u1", name: "Jörg" });
  assert.equal(jwtClaims("not-a-jwt"), null);
  assert.equal(sessionFromTokens({ access_token: "a" }, NOW_S), null);
  const fromExpiresIn = sessionFromTokens({ access_token: jwt({ sub: "u1" }), refresh_token: "r", expires_in: 100 }, NOW_S);
  assert.equal(fromExpiresIn?.expiresAt, NOW_S + 100);
});
