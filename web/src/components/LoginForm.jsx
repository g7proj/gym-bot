import { useState } from 'react';

// Simple credential form used before the Supabase session exists.
export default function LoginForm({ onLogin, onChangePassword, loading }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">Sign in</h2>
      <p className="mb-4 text-sm text-slate-600">Use your gym portal credentials.</p>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="username">
            Username
          </label>
          <input
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <div className="relative mt-2">
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
      <button
        type="button"
        onClick={onChangePassword}
        className="mt-4 text-xs font-semibold text-slate-600 hover:text-slate-800"
      >
        Change password
      </button>
    </div>
  );
}
