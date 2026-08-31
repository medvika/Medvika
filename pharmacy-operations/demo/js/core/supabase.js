
const SUPABASE_URL = 
  "https://geqrrrzbvemraiyqyxnc.supabase.co";
const SUPABASE_ANON_KEY = 
  "sb_publishable_dgN1GE1pYUs2PW-0zm2W8g_nRP_41Io";

if (!window.supabase) {
  throw new Error(
    "Supabase library failed to load."
  );
}

window.supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
