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
REACT_APP_API_URL=http://127.0.0.1:8000
```

```dotenv
# web\.env.production
REACT_APP_API_URL=https://gym-bot-di88.onrender.com
```

React Scripts will load the correct file automatically:

- `npm start` uses `.env.development`
- `npm run build` uses `.env.production`

You can keep shared values in `web\.env`.

## Setup

1. Install Node.js and npm.
2. Run `npm install`.
3. Start the dev server with `npm start`.
