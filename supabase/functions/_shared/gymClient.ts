// API client for the external gym booking system.
const BASE_URL = 'https://inforyou.teamsystem.com/dream/api/v1';
const COMPANY_ID = 2;
const DEFAULT_APP_TOKEN = (
  'BEF7B53DFC2052488E6ECE5A5F2AA0CBC2C27110B9E292EDBE10A138EBF9C25A'
  + '249FE8E018656CF3596032CB821C179FA266FC29895E3371642920A4F97DBE2B'
  + '66C414906712FD5DF79423A9106E1B60FC5EB2B6577EA7C7756AB5A38BB5CCD3'
  + 'AA991350BE141D11477EB4808D9F14EFA901ED108578094A290044DAD3B8D04E'
  + '3BC3562938747973A156F24F2D4B9EA201FE499C3BC2BF714251A9CE099BD052'
);

// Legacy host required by the provider.
const IYES_URL = 'http://95.130.140.135:65432';

// Prefer env token so we can rotate without code changes.
function getAppToken(): string {
  return Deno.env.get('GYM_APP_TOKEN') || DEFAULT_APP_TOKEN;
}

// The API expects app-token and auth data in cookies, not just headers.
function buildCookie(appToken: string, authToken?: string): string {
  const parts = [
    `app-token=${appToken}`,
    `iyesurl=${IYES_URL}`,
    'lang=en',
    'cookie-acceptance=accepted',
  ];
  if (authToken) {
    parts.push(`AuthToken=${authToken}`);
    parts.push(`company=${COMPANY_ID}`);
  }
  return parts.join('; ');
}

// Authenticate and return the session token used by all booking endpoints.
export async function gymLogin(username: string, password: string): Promise<string> {
  const appToken = getAppToken();
  const loginUrl = new URL(`${BASE_URL}/security/webauthenticate`);
  loginUrl.searchParams.set('login', username);
  loginUrl.searchParams.set('password', password);
  loginUrl.searchParams.set('companyid', String(COMPANY_ID));
  loginUrl.searchParams.set(
    'confirmlink',
    'https://inforyou.teamsystem.com/dream/account-verification/',
  );

  const response = await fetch(loginUrl.toString(), {
    method: 'GET',
    headers: {
      AppToken: appToken,
      IYESUrl: IYES_URL,
      Cookie: buildCookie(appToken),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed with HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data?.Successful) {
    const message = data?.ErrorMessage || data?.Comment || 'Unknown error';
    throw new Error(`Login not successful: ${message}`);
  }
  if (!data?.Item || typeof data.Item !== 'string') {
    throw new Error('Login response missing token');
  }
  return data.Item;
}

// List classes and the user's bookings in a date/time window.
export async function listWithMine(
  token: string,
  startDate: string,
  endDate: string,
  timeStart: string,
  timeEnd: string,
): Promise<any> {
  const appToken = getAppToken();
  const response = await fetch(`${BASE_URL}/webbooking/listwithmine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      AppToken: appToken,
      IYESUrl: IYES_URL,
      AuthToken: token,
      Cookie: buildCookie(appToken, token),
    },
    body: JSON.stringify({
      CompanyID: COMPANY_ID,
      Types: [],
      StartDate: startDate,
      EndDate: endDate,
      TimeStart: timeStart,
      TimeEnd: timeEnd,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`listwithmine failed with HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

// Fetch all current bookings for the authenticated user.
export async function myBookings(token: string): Promise<any> {
  const appToken = getAppToken();
  const url = new URL(`${BASE_URL}/webbooking/mybooks`);
  url.searchParams.set('companyID', String(COMPANY_ID));
  url.searchParams.set('Type', '');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      AppToken: appToken,
      IYESUrl: IYES_URL,
      AuthToken: token,
      Cookie: buildCookie(appToken, token),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`mybooks failed with HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

// Shared helper for booking, waitlist, and cancel endpoints.
async function postBooking(
  token: string,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<any> {
  const appToken = getAppToken();
  const response = await fetch(`${BASE_URL}/webbooking/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      AppToken: appToken,
      IYESUrl: IYES_URL,
      AuthToken: token,
      Cookie: buildCookie(appToken, token),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${endpoint} failed with HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data?.Successful) {
    const message = data?.ErrorMessage || data?.Comment || 'Unknown error';
    throw new Error(`${endpoint} not successful: ${message}`);
  }
  return data;
}

// Confirm a booking with the gym API.
export async function bookLesson(token: string, payload: Record<string, unknown>): Promise<any> {
  return postBooking(token, 'book', payload);
}

// Add the user to the waitlist when no places are available.
export async function addWait(token: string, payload: Record<string, unknown>): Promise<any> {
  return postBooking(token, 'AddWait', payload);
}

// Cancel a confirmed booking.
export async function cancelBooking(token: string, payload: Record<string, unknown>): Promise<any> {
  return postBooking(token, 'cancel', payload);
}

// Remove the user from the waitlist.
export async function removeWait(token: string, payload: Record<string, unknown>): Promise<any> {
  return postBooking(token, 'RemoveWait', payload);
}
