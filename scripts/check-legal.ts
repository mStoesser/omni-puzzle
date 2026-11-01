// Run by the deploy workflow before building: imprint and privacy policy must be complete.
// With a production backend (.env.production) the privacy policy must also cover the account features.
import { readFileSync } from "node:fs";
import { imprintComplete } from "../src/imprint.ts";
import { privacyComplete } from "../src/privacy.ts";

let env = "";
try {
  env = readFileSync(new URL("../.env.production", import.meta.url), "utf8");
} catch {
  // no production backend
}
const withBackend = /^VITE_SUPABASE_URL=\S+/m.test(env);

const problems: string[] = [];
if (!imprintComplete()) problems.push("src/imprint.ts is incomplete");
if (!privacyComplete(withBackend)) {
  problems.push(`src/privacy.ts is incomplete (reviewed must be true${withBackend ? ", mailProvider is required with a backend" : ""})`);
}
for (const problem of problems) console.error(problem);
process.exit(problems.length === 0 ? 0 : 1);
