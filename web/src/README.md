# Frontend Structure

This folder follows a simple, scalable React layout. The goal is to keep UI, data access, and utilities separated so each file has a clear responsibility.

## Folders

- `components/` – Reusable UI building blocks and view components.
- `constants/` – Shared labels and static values used by the UI.
- `services/` – Supabase client setup, auth helpers, and edge-function calls.
- `utils/` – Pure helper functions (formatters and small data utilities).

## Entry Points

- `App.js` – Application state and orchestration (data loading, routing between tabs, and top-level layout).
- `index.js` – React bootstrapping and global styles.
- `index.css` – Tailwind/global styling.

## Data Flow (High Level)

- `services/` fetches data and invokes edge functions.
- `App.js` coordinates loading and stores state.
- `components/` render UI based on props and callbacks.

## Notes

- UI components should avoid direct API calls. Keep side effects in `services/` + `App.js`.
- Utility functions must stay side-effect free.
