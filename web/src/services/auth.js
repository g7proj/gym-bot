import { supabase } from './supabaseClient';

// Fetch the current auth session (if any).
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

function usernameToEmail(username) {
  const cleaned = String(username || '').trim().toLowerCase();
  return `${cleaned}@gymbot.example`;
}

// Sign in the user or create the account if it does not exist.
export async function signInOrSignUp(username, password) {
  const email = usernameToEmail(username);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!signInError && signInData?.session) {
    return signInData.session;
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError && signUpError.message !== 'User already registered') {
    throw signUpError;
  }
  if (signUpData?.session) {
    return signUpData.session;
  }

  const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (retryError) {
    throw retryError;
  }
  return retryData.session;
}
