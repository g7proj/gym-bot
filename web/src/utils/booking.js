// Stable key for booking rows when merging availability with user bookings.
export function bookingKey(item) {
  const service = String(item?.service || '').toLowerCase();
  const date = String(item?.date || '');
  const startRaw = String(item?.startTime || '');
  const endRaw = String(item?.endTime || '');
  const start = startRaw.includes('T') ? startRaw.slice(11, 16) : startRaw;
  const end = endRaw.includes('T') ? endRaw.slice(11, 16) : endRaw;
  return `${date}|${service}|${start}|${end}`;
}

// Date-scoped lesson occurrence key (`IDLesson` is shared across recurring weeks in InfoYou).
export function lessonOccurrenceKey(item) {
  const idLesson = Number(item?.idLesson || 0);
  const date = String(item?.date || '');
  if (!idLesson || !date) return null;
  const startRaw = String(item?.startTime || '');
  const start = startRaw.includes('T') ? startRaw.slice(11, 16) : startRaw.slice(0, 5);
  return `${date}|${idLesson}|${start}`;
}
