import { useEffect } from 'react';

// Modal for pairing or disconnecting Telegram 07:01 auto-book error notifications via deep link.
export default function TelegramModal({
  open,
  onClose,
  connection,
  deepLinkUrl,
  loading,
  onGenerateLink,
  onCheckStatus,
  onDisconnect,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const isConnected = Boolean(connection && connection.enabled !== false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Telegram error alerts
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Get notified at 07:01 if an automated booking fails (for example when your gym password expires).
            </p>
          </div>
          <span
            className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
              isConnected
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {isConnected ? 'Connected' : 'Not linked'}
          </span>
        </div>

        {isConnected ? (
          <div className="space-y-4">
            <div className="rounded border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <div className="font-semibold">
                Active{connection.telegramUsername ? ` · ${connection.telegramUsername}` : ''}
              </div>
              <div className="mt-0.5 text-[11px] opacity-90">
                Only automated booking errors are sent — no daily spam when everything succeeds.
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={onDisconnect}
                disabled={loading}
                className="rounded border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
              >
                {loading ? 'Disconnecting...' : 'Disconnect'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {!deepLinkUrl ? (
              <button
                type="button"
                onClick={onGenerateLink}
                disabled={loading}
                className="w-full rounded bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
              >
                {loading ? 'Generating link...' : 'Generate Telegram link'}
              </button>
            ) : (
              <div className="space-y-2.5">
                <a
                  href={deepLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-1.5 rounded bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark"
                >
                  <span>Open in Telegram</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Tap <strong>Start</strong> inside Telegram to finish linking (link valid for 15 minutes), then return here.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {deepLinkUrl && onCheckStatus && (
                <button
                  type="button"
                  onClick={onCheckStatus}
                  disabled={loading}
                  className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Check status
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
