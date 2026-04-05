import { NOTICE_COLORS } from '../constants/calendar';

// Toast message with semantic color mapping.
export default function NoticeToast({ notice }) {
  if (!notice) return null;
  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 text-white px-4 py-2 rounded-full shadow-lg ${NOTICE_COLORS[notice.type]}`}
    >
      {notice.message}
    </div>
  );
}
