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

function isInvalidCredentials(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'invalid_credentials' || message.includes('invalid login credentials');
}

function isUserAlreadyExists(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'user_already_exists' || message.includes('already registered');
}

// Attempt to recover an existing Supabase Auth user using gym credentials.
async function recoverAuthPassword(username, password) {
  const { error } = await supabase.functions.invoke('gym-recover', {
    body: { username, password },
  });
  if (error) {
    throw error;
  }
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
  if (signUpError && !isUserAlreadyExists(signUpError)) {
    throw signUpError;
  }
  if (signUpData?.session) {
    return signUpData.session;
  }

  if (isInvalidCredentials(signInError) || isUserAlreadyExists(signUpError)) {
    await recoverAuthPassword(username, password);
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
