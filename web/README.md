# Frontend (React)

React SPA for user login and preference management.

## Environment Variables

Create environment files for local vs production builds:

```
web\.env.development
web\.env.production
```

Example contents:

```dotenv
# web\.env.development
REACT_APP_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
REACT_APP_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

```dotenv
# web\.env.production
REACT_APP_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
REACT_APP_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

React Scripts will load the correct file automatically:

- `npm start` uses `.env.development`
- `npm run build` uses `.env.production`

You can keep shared values in `web\.env`.

## Setup

1. Install Node.js and npm.
2. Run `npm install`.
3. Start the dev server with `npm start`.
