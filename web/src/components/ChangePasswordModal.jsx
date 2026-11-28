import { useEffect, useState } from 'react';

// Modal form for changing the gym portal password while authenticated.
export default function ChangePasswordModal({
  open,
  onClose,
  onSubmit,
  loading,
  successMessage,
}) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

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

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ oldPassword, newPassword, confirmPassword });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) handleClose();
      }}
    >
      <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Change password</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Updates your gym portal password and keeps your account synced.
          </p>
        </div>

        {successMessage ? (
          <div className="space-y-4">
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {successMessage}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="oldPassword">
                Current password
              </label>
              <div className="relative mt-1">
                <input
                  id="oldPassword"
                  type={showOld ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 pr-12 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowOld((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  {showOld ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="newPassword">
                New password
              </label>
              <div className="relative mt-1">
                <input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 pr-12 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 pr-12 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
              >
                {loading ? 'Saving...' : 'Update'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
