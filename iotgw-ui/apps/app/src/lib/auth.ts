import { useEffect, useState } from "react";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Operator authentication (decision-034): email + password against Supabase
 * Auth (GoTrue, through Kong) with the public anon key. The session is
 * persisted in localStorage and auto-refreshed by supabase-js; its access
 * token is attached to every tRPC call (src/utils/trpc.ts). Whether the user
 * is an operator (app_metadata.iotgw_role) is decided by the backend.
 */

const STORAGE_KEY = "iotgw-ui-auth";

let client: SupabaseClient | null = null;

/** Created lazily so modules importing this file work without the env (tests). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Operator login is not configured: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing from the build.",
      );
    }
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: STORAGE_KEY,
      },
    });
  }
  return client;
}

export async function getSession(): Promise<Session | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

/** The current access token (refreshed by supabase-js when near expiry). */
export async function getAccessToken(): Promise<string | undefined> {
  return (await getSession())?.access_token;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  try {
    await getSupabase().auth.signOut();
  } catch {
    // Local session is cleared regardless; nothing else to do.
  }
}

/** The current session, kept up to date across sign-in / refresh / sign-out. */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let isActive = true;
    void getSession().then((s) => {
      if (isActive) setSession(s);
    });
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = getSupabase().auth.onAuthStateChange((_event, s) => {
        setSession(s);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Not configured (tests): no session.
    }
    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, []);

  return session;
}

/** Path of the login page, preserving where the operator was going. */
export function loginPath(redirect?: string): string {
  return redirect && redirect !== "/login"
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : "/login";
}
