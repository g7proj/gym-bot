import { supabase } from './supabaseClient';
import { getSession } from './auth';

async function invokeWithSession(functionName, body) {
  const session = await getSession();
  if (!session?.access_token) throw new Error('Missing auth session');

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  return data;
}

// Fetch available courses grouped by weekday.
export async function fetchCourses() {
  const data = await invokeWithSession('gym-courses');
  return data?.by_day || {};
}

// Fetch the calendar window and lesson availability.
export async function fetchCalendar() {
  return invokeWithSession('gym-calendar');
}

// Fetch the authenticated user's current bookings.
export async function fetchMyBookings() {
  const data = await invokeWithSession('gym-mybooks');
  return Array.isArray(data?.items) ? data.items : [];
}

// Send a booking request for the selected lesson.
export async function bookLesson(item) {
  await invokeWithSession('gym-book', {
    idService: item.idService,
    idLesson: item.idLesson,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    type: 0,
    idDurata: 0,
    bookNr: 0,
    availablePlaces: item.availablePlaces,
    isUserPresent: item.isUserPresent,
    waitingListPosition: item.waitingListPosition,
  });
}

// Cancel a booking or remove the user from the waitlist.
export async function cancelLesson(item) {
  await invokeWithSession('gym-cancel', {
    bookingId: item.bookingId,
    idLesson: item.idLesson,
    type: item.type ?? 0,
    idDurata: item.idDurata ?? 0,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    isUserPresent: item.isUserPresent,
  });
}
