import { test } from "node:test";
import assert from "node:assert/strict";
import { accountErrorText, fetchProfile, renameUser, usernameProblem } from "./account.ts";
import { ApiError, createApi } from "./api.ts";

test("usernameProblem", () => {
  assert.equal(usernameProblem("Rätselfan_2"), null);
  assert.equal(usernameProblem("a.b-c"), null);
  assert.equal(usernameProblem("ab"), "too-short");
  assert.equal(usernameProblem("x".repeat(21)), "too-long");
  assert.equal(usernameProblem("mit leer"), "invalid-chars");
  assert.equal(usernameProblem("<b>hi</b>"), "invalid-chars");
});

test("fetchProfile and renameUser use PostgREST filters", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(init.method === "PATCH" ? null : '[{"id":"u1","username":"fan","is_moderator":false,"banned":false}]', {
      status: init.method === "PATCH" ? 204 : 200,
    });
  }) as typeof fetch;
  const api = createApi({ url: "https://abc.supabase.co", key: "k" }, { fetch: fake });
  assert.deepEqual(await fetchProfile(api, "u1"), { id: "u1", username: "fan", isModerator: false, banned: false });
  await renameUser(api, "u1", "neu");
  assert.equal(calls[0]!.url, "https://abc.supabase.co/rest/v1/profiles?id=eq.u1&select=id%2Cusername%2Cis_moderator%2Cbanned");
  assert.equal(calls[1]!.url, "https://abc.supabase.co/rest/v1/profiles?id=eq.u1");
  assert.equal(calls[1]!.init.body, '{"username":"neu"}');
});

test("accountErrorText maps auth codes and falls back to API texts", () => {
  assert.equal(accountErrorText(new ApiError("invalid", 400, "", "invalid_credentials")), "authInvalidCredentials");
  assert.equal(accountErrorText(new ApiError("invalid", 400, "", "email_not_confirmed")), "authEmailNotConfirmed");
  assert.equal(accountErrorText(new ApiError("conflict", 409, "", "23505")), "usernameTaken");
  assert.equal(accountErrorText(new ApiError("offline", 0)), "apiOffline");
});
