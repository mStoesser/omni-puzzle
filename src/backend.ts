import { backendConfig } from "./core/api.ts";

// Supabase project of this build: VITE_SUPABASE_URL and VITE_SUPABASE_KEY from .env.development (dev server)
// or .env.production (build). The key is the public publishable key; security comes from Row Level Security
// (supabase/migrations). Without both values the community features stay hidden and the app works as in phase 1.
export const backend = backendConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY);
