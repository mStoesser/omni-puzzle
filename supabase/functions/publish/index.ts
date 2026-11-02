// Edge Function "publish" (Deno). The logic is shared with the app and tested there:
// src/server/publish-handler.ts → src/core/publish.ts → the puzzle types' rules.ts.
// Deployed by .github/workflows/deploy-functions.yml.
import { handlePublish } from "../../../src/server/publish-handler.ts";

/** Newer projects provide their secret keys as JSON; older ones the legacy service_role JWT. */
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch {
    // fall back to the legacy key
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const env = { url: Deno.env.get("SUPABASE_URL") ?? "", serviceKey: serviceKey() };

Deno.serve((request) => handlePublish(request, env));
