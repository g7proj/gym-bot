// Extract the JSON { error, message } body from a Supabase FunctionsHttpError response.
export async function extractFunctionError(error, fallbackMessage = 'Request failed') {
  if (!error) return fallbackMessage;

  const context = error.context;
  if (context && typeof context.json === 'function') {
    try {
      const cloned = typeof context.clone === 'function' ? context.clone() : context;
      const payload = await cloned.json();
      const detail = payload?.error || payload?.message;
      if (detail && typeof detail === 'string') {
        return detail;
      }
    } catch (_jsonErr) {
      if (typeof context.text === 'function') {
        try {
          const text = await context.text();
          if (text && text.trim()) {
            return text.trim();
          }
        } catch (_textErr) {
          // Fall through to error.message
        }
      }
    }
  }

  const rawMessage = String(error?.message || '').trim();
  if (rawMessage && !rawMessage.includes('non-2xx status code')) {
    return rawMessage;
  }
  return fallbackMessage;
}
