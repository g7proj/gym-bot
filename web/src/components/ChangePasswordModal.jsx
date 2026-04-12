import { useState } from 'react';

// Modal form for changing the gym password.
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

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ oldPassword, newPassword, confirmPassword });
  };

  const handleClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-5 shadow-lg">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Change password</h3>
          <p className="text-xs text-slate-500">Update your gym portal password.</p>
        </div>

        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="oldPassword">
                Current password
              </label>
              <div className="relative mt-2">
                <input
                  id="oldPassword"
                  type={showOld ? 'text' : 'password'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowOld((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500"
                >
                  {showOld ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="newPassword">
                New password
              </label>
              <div className="relative mt-2">
                <input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500"
                >
                  {showNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                Confirm new password
              </label>
              <div className="relative mt-2">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500"
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Update'}
              </button>
            </div>
          </form>
        )}

        {successMessage && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
