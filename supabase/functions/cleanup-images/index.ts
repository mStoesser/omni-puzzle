// Edge Function "cleanup-images" (Deno). Logic and tests: src/server/cleanup-handler.ts.
// Needs the function secret CLEANUP_SECRET (Dashboard → Edge Functions → Secrets).
import { handleCleanup } from "../../../src/server/cleanup-handler.ts";

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

const env = { url: Deno.env.get("SUPABASE_URL") ?? "", serviceKey: serviceKey(), secret: Deno.env.get("CLEANUP_SECRET") ?? "" };

Deno.serve((request) => handleCleanup(request, env));
