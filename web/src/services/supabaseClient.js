import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (or REACT_APP_SUPABASE_*).',
  );
}

// Shared client used by auth and edge-function calls.
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
