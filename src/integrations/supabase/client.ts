// Client-side Supabase client — uses anon key (safe for browser)
import { createClient } from "@supabase/supabase-js";
import { getMissingSupabasePublicEnv, getSupabasePublicEnv } from "./env";
import type { Database } from "./types";
import { brokeredPreviewStorage } from "./previewAuthStorage";

function createSupabaseClient() {
  const { url, anonKey } = getSupabasePublicEnv();

  if (!url || !anonKey) {
    const missing = getMissingSupabasePublicEnv({ url, anonKey });
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
