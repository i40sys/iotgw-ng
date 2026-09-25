/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Supabase Auth (GoTrue via Kong) for operator login (decision-034). The
  // anon key is a public client key — it only reaches GoTrue's public routes.
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
