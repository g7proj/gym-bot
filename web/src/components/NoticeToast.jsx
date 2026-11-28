import { NOTICE_STYLES } from '../constants/calendar';

// Compact floating toast anchored above the mobile safe-area inset.
export default function NoticeToast({ notice }) {
  if (!notice) return null;
  const styleClass = NOTICE_STYLES[notice.type] || NOTICE_STYLES.info;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-semibold shadow-lg ${styleClass}`}
    >
      {notice.message}
    </div>
  );
}
