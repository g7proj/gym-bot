# Frontend (React 19 + Vite + Tailwind CSS v4)

Mobile-first React SPA for gym class booking and automated preference management.

## Environment Variables

Create environment files for local vs production builds:

```
web\.env.development
web\.env.production
```

Example contents (`VITE_*` is recommended; `REACT_APP_*` remains supported for backward compatibility):

```dotenv
# web\.env.development
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=YOUR_LOCAL_PUBLISHABLE_OR_ANON_KEY
```

```dotenv
# web\.env.production
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Vite loads the matching file automatically:

- `npm start` / `npm run dev` uses `.env.development` (serves on `http://localhost:3000`)
- `npm run build` uses `.env.production` (outputs to `web/build` with `/gym-bot/` base path)

## Commands

1. Install dependencies: `npm install`
2. Start dev server: `npm start`
3. Run ESLint: `npm run lint`
4. Run unit tests (Vitest): `npm test`
5. Build production bundle: `npm run build`
