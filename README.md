# Baakio frontend

React and TypeScript PWA for the Baakio owner ledger. It is a separate app from `../baakio-be` and calls the authenticated REST API directly. Account holders can sign in with Google or an email code and link another sign-in method in Settings.

## Local run

1. Start the backend using the instructions in `../baakio-be/README.md`.
2. Copy `.env.example` to `.env.local`.
3. Install packages with `npm install`.
4. Start Vite with `npm run dev` and open `http://127.0.0.1:5173`. Select Get Started or Log in to open `/app.html`.

Local email codes appear in the development UI; no sending domain is needed. To
try Google sign-in, create an OAuth Web application client with the localhost
and 127.0.0.1 origins and set `GOOGLE_CLIENT_ID` in the backend `.env`. The
backend supplies the public client ID to the frontend through `/auth/config`.

`VITE_API_BASE_URL` is blank in the local example, so Vite proxies `/api` to `http://127.0.0.1:8080` and keeps the session and CSRF cookies same-origin. Set it to the backend origin only when a deployed frontend uses direct cross-origin requests; in that case, set the backend `FRONTEND_ORIGIN` to the exact browser origin.

The production build uses `https://api.baakio.shop` from `.env.production`.
The frontend production hostname is `https://baakio.shop`.

The implemented screens use persisted English/Hindi language selection and the backend for customer search, statements, balances, reminders, scan review, and every financial write. Bill scans upload one image, poll an asynchronous draft, show the private original beside editable extracted items, and post only after the shopkeeper confirms. Manual purchase entry remains available when image scanning fails.
