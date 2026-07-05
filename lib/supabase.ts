import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client — project: t4xi-address-system (eu-west-1).
 * Alleen de anon key wordt client-side gebruikt; RLS policies zijn leidend.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase-configuratie ontbreekt: zet NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (zie .env.example)."
    );
  }

  return createBrowserClient(url, anonKey);
}
