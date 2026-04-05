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
